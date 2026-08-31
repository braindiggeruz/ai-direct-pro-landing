using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

namespace GPTBotCollector {
    public sealed class LocalAccountSnapshot {
        public string Name, Comment; public SecurityIdentifier SID; public uint Flags;
    }
    // Fixed local identity only; no dependency on the optional LocalAccounts module.
    public static class LocalAccount {
        const string Name = "GPTBotCollector";
        [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct UserInfo1 {
            [MarshalAs(UnmanagedType.LPWStr)] public string Name;
            public IntPtr Password;
            public uint PasswordAge, Privilege;
            [MarshalAs(UnmanagedType.LPWStr)] public string HomeDirectory, Comment;
            public uint Flags;
            [MarshalAs(UnmanagedType.LPWStr)] public string ScriptPath;
        }
        [StructLayout(LayoutKind.Sequential)] struct UserInfo23 {
            public IntPtr Name, FullName, Comment; public uint Flags; public IntPtr Sid;
        }
        [StructLayout(LayoutKind.Sequential)] struct UserInfo1008 { public uint Flags; }
        [StructLayout(LayoutKind.Sequential)] struct UserInfo1003 { public IntPtr Password; }
        [StructLayout(LayoutKind.Sequential)] struct GroupMember0 { public IntPtr Sid; }
        [DllImport("netapi32.dll", CharSet=CharSet.Unicode)] static extern uint NetUserGetInfo(string server, string user, uint level, out IntPtr buffer);
        [DllImport("netapi32.dll", CharSet=CharSet.Unicode)] static extern uint NetUserAdd(string server, uint level, ref UserInfo1 info, out uint parameterError);
        [DllImport("netapi32.dll", CharSet=CharSet.Unicode)] static extern uint NetUserSetInfo(string server, string user, uint level, ref UserInfo1008 info, out uint parameterError);
        [DllImport("netapi32.dll", CharSet=CharSet.Unicode, EntryPoint="NetUserSetInfo")] static extern uint NetUserSetPassword(string server, string user, uint level, ref UserInfo1003 info, out uint parameterError);
        [DllImport("netapi32.dll", CharSet=CharSet.Unicode)] static extern uint NetUserGetLocalGroups(string server, string user, uint level, uint flags, out IntPtr buffer, uint preferredLength, out uint entriesRead, out uint totalEntries);
        [DllImport("netapi32.dll", CharSet=CharSet.Unicode)] static extern uint NetLocalGroupAddMembers(string server, string group, uint level, ref GroupMember0 member, uint totalEntries);
        [DllImport("netapi32.dll")] static extern uint NetApiBufferFree(IntPtr buffer);

        static string Comment(string installationId) {
            Guid parsed;
            if (!Guid.TryParseExact(installationId,"D",out parsed)) throw new InvalidOperationException("installation_id_invalid");
            return "GPTBot collector " + installationId;
        }
        static void RequireSuccess(uint status, string operation) {
            if (status != 0) throw new InvalidOperationException(operation + "_" + status.ToString(System.Globalization.CultureInfo.InvariantCulture));
        }
        public static LocalAccountSnapshot Get() {
            IntPtr buffer=IntPtr.Zero;
            try {
                uint status=NetUserGetInfo(null,Name,23,out buffer);
                if (status == 2221) return null; // NERR_UserNotFound, not any arbitrary lookup failure.
                RequireSuccess(status,"local_account_query");
                var value=(UserInfo23)Marshal.PtrToStructure(buffer,typeof(UserInfo23));
                return new LocalAccountSnapshot { Name=Marshal.PtrToStringUni(value.Name),
                    SID=new SecurityIdentifier(value.Sid), Comment=Marshal.PtrToStringUni(value.Comment), Flags=value.Flags };
            } finally { if (buffer != IntPtr.Zero) NetApiBufferFree(buffer); }
        }
        internal static LocalAccountSnapshot RequireOwned(string sid, string installationId) {
            var account=Get();
            if (account == null || account.Name != Name || account.SID.Value != sid || account.Comment != Comment(installationId))
                throw new InvalidOperationException("account_ownership_mismatch");
            return account;
        }
        public static LocalAccountSnapshot Create(SecureString password, string installationId) {
            string comment=Comment(installationId);
            if (Get() != null) throw new InvalidOperationException("dedicated_account_exists");
            if (password == null || password.Length < 32) throw new InvalidOperationException("account_password_invalid");
            IntPtr secret=Marshal.SecureStringToGlobalAllocUnicode(password);
            try {
                // USER_PRIV_USER; UF_SCRIPT|NORMAL_ACCOUNT|DONT_EXPIRE_PASSWD|PASSWD_CANT_CHANGE.
                var info=new UserInfo1 { Name=Name, Password=secret, Privilege=1, Comment=comment, Flags=0x1|0x200|0x10000|0x40 };
                uint parameterError;
                RequireSuccess(NetUserAdd(null,1,ref info,out parameterError),"local_account_create");
            } finally { Marshal.ZeroFreeGlobalAllocUnicode(secret); }
            var created=Get();
            if (created == null || created.Comment != comment) throw new InvalidOperationException("account_creation_readback_failed");
            return created;
        }
        static string BuiltinAlias(string sid) {
            string qualified=((NTAccount)new SecurityIdentifier(sid).Translate(typeof(NTAccount))).Value;
            int separator=qualified.LastIndexOf('\\');
            if (separator < 0) throw new InvalidOperationException("builtin_alias_unresolved");
            return qualified.Substring(separator+1);
        }
        // Native read-only membership lookup includes indirect membership, fails closed on partial/error results.
        public static bool IsMemberOfBuiltin(string sid) {
            if (sid != "S-1-5-32-544" && sid != "S-1-5-32-545") throw new InvalidOperationException("builtin_alias_refused");
            string alias=BuiltinAlias(sid); IntPtr buffer=IntPtr.Zero; uint count,total;
            try {
                RequireSuccess(NetUserGetLocalGroups(null,Name,0,1,out buffer,uint.MaxValue,out count,out total),"local_membership_query");
                if (count != total || count > 4096) throw new InvalidOperationException("local_membership_incomplete");
                for (int i=0;i<(int)count;i++) {
                    string group=Marshal.PtrToStringUni(Marshal.ReadIntPtr(buffer,i*IntPtr.Size));
                    if (String.Equals(group,alias,StringComparison.OrdinalIgnoreCase)) return true;
                }
                return false;
            } finally { if (buffer != IntPtr.Zero) NetApiBufferFree(buffer); }
        }
        public static void AddToBuiltinUsers(string sid, string installationId) {
            RequireOwned(sid,installationId);
            if (IsMemberOfBuiltin("S-1-5-32-544")) throw new InvalidOperationException("collector_unexpected_administrator");
            if (!IsMemberOfBuiltin("S-1-5-32-545")) {
                var identifier=new SecurityIdentifier(sid); var bytes=new byte[identifier.BinaryLength]; identifier.GetBinaryForm(bytes,0);
                var pinned=GCHandle.Alloc(bytes,GCHandleType.Pinned);
                try {
                    var member=new GroupMember0 { Sid=pinned.AddrOfPinnedObject() };
                    uint status=NetLocalGroupAddMembers(null,BuiltinAlias("S-1-5-32-545"),0,ref member,1);
                    if (status != 1378) RequireSuccess(status,"local_users_membership_add"); // ERROR_MEMBER_IN_ALIAS is harmless after race.
                } finally { pinned.Free(); }
            }
            if (!IsMemberOfBuiltin("S-1-5-32-545") || IsMemberOfBuiltin("S-1-5-32-544"))
                throw new InvalidOperationException("collector_membership_readback_failed");
        }
        public static void DisableOwned(string sid, string installationId) {
            var account=RequireOwned(sid,installationId);
            var info=new UserInfo1008 { Flags=account.Flags|0x2 }; uint parameterError;
            RequireSuccess(NetUserSetInfo(null,Name,1008,ref info,out parameterError),"local_account_disable");
            if ((RequireOwned(sid,installationId).Flags&0x2)==0) throw new InvalidOperationException("account_disable_readback_failed");
        }
        // Caller must also prove no profile/DPAPI/config/task exists before recovery.
        public static void ResetUnprovisionedOwned(string sid, string installationId, SecureString password) {
            var account=RequireOwned(sid,installationId);
            const string root="C:\\ProgramData\\GPTBot\\LeadRadarCollector";
            if(Directory.Exists("C:\\Users\\GPTBotCollector") || File.Exists(root+"\\config.json") ||
               File.Exists(root+"\\secrets\\token.dpapi") || File.Exists(root+"\\private\\state.sqlite3"))
                throw new InvalidOperationException("recovery_profile_or_provisioning_present");
            using(var profile=Microsoft.Win32.Registry.LocalMachine.OpenSubKey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\"+sid)) {
                if(profile!=null) throw new InvalidOperationException("recovery_profile_or_provisioning_present");
            }
            if (IsMemberOfBuiltin("S-1-5-32-544")) throw new InvalidOperationException("collector_unexpected_administrator");
            if (password==null || password.Length<32) throw new InvalidOperationException("account_password_invalid");
            IntPtr secret=Marshal.SecureStringToGlobalAllocUnicode(password); uint parameterError;
            try {
                var value=new UserInfo1003 { Password=secret };
                RequireSuccess(NetUserSetPassword(null,Name,1003,ref value,out parameterError),"local_recovery_password");
            } finally { Marshal.ZeroFreeGlobalAllocUnicode(secret); }
            var flags=new UserInfo1008 { Flags=account.Flags&~0x2u };
            RequireSuccess(NetUserSetInfo(null,Name,1008,ref flags,out parameterError),"local_recovery_enable");
            if ((RequireOwned(sid,installationId).Flags&0x2)!=0) throw new InvalidOperationException("recovery_enable_readback_failed");
        }
    }
    public sealed class ProcessResult {
        public int ExitCode; public string Output; public bool TimedOut, TraverseBypassRemoved;
    }
    public sealed class RootDenyResult {
        public bool Changed, LegacyAutoInheritedCleared;
        public int ControlBefore, ControlAfter;
    }
    public static class Native {
        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
        static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security,
            uint disposition, uint flags, IntPtr template);
        [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attrs, string name);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int type, ref Limits info, uint length);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
        [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr pointer);
        [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool LookupPrivilegeValue(string system,string name,out Luid luid);
        [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int type,IntPtr buffer,uint length,out uint needed);
        [DllImport("advapi32.dll",SetLastError=true)] static extern bool AdjustTokenPrivileges(IntPtr token,bool disableAll,ref TokenPrivilege value,uint length,IntPtr previous,IntPtr needed);
        [DllImport("advapi32.dll")] static extern uint GetSecurityInfo(SafeFileHandle handle,int type,uint info,out IntPtr owner,out IntPtr group,out IntPtr dacl,out IntPtr sacl,out IntPtr descriptor);
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]
        static extern bool SetFileSecurityW(string path,uint info,IntPtr descriptor);
        [DllImport("advapi32.dll")] static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
        [StructLayout(LayoutKind.Sequential)] struct Luid { public uint Low; public int High; }
        [StructLayout(LayoutKind.Sequential)] struct TokenPrivilege { public uint Count; public Luid Luid; public uint Attributes; }

        static Luid TraverseLuid() {
            Luid luid;
            if (!LookupPrivilegeValue(null,"SeChangeNotifyPrivilege",out luid)) throw new InvalidOperationException("traverse_privilege_lookup_failed");
            return luid;
        }
        static bool TokenContainsTraverse(IntPtr token) {
            uint length; GetTokenInformation(token,3,IntPtr.Zero,0,out length);
            if (length<4 || length>65536) throw new InvalidOperationException("token_privileges_size_invalid");
            IntPtr buffer=Marshal.AllocHGlobal((int)length);
            try {
                if (!GetTokenInformation(token,3,buffer,length,out length)) throw new InvalidOperationException("token_privileges_query_failed");
                int count=Marshal.ReadInt32(buffer); var luid=TraverseLuid();
                if (count<0 || count>1024 || 4+count*12>length) throw new InvalidOperationException("token_privileges_invalid");
                for (int i=0;i<count;i++) {
                    int offset=4+i*12;
                    if (unchecked((uint)Marshal.ReadInt32(buffer,offset))==luid.Low && Marshal.ReadInt32(buffer,offset+4)==luid.High) return true;
                }
                return false;
            } finally { Marshal.FreeHGlobal(buffer); }
        }
        static bool ProcessContainsTraverse(IntPtr process) {
            IntPtr token;
            if (!OpenProcessToken(process,8,out token)) throw new InvalidOperationException("process_token_query_failed");
            try { return TokenContainsTraverse(token); } finally { CloseHandle(token); }
        }
        public static bool TraverseBypassPresent() { return ProcessContainsTraverse(GetCurrentProcess()); }
        public static void RemoveTraverseBypass() {
            IntPtr token;
            if (!OpenProcessToken(GetCurrentProcess(),8|32,out token)) throw new InvalidOperationException("process_token_adjust_failed");
            try {
                if (TokenContainsTraverse(token)) {
                    // SE_PRIVILEGE_REMOVED, never merely disabled; cannot be re-enabled in this token.
                    var value=new TokenPrivilege { Count=1,Luid=TraverseLuid(),Attributes=4 };
                    if (!AdjustTokenPrivileges(token,false,ref value,0,IntPtr.Zero,IntPtr.Zero) || Marshal.GetLastWin32Error()!=0)
                        throw new InvalidOperationException("traverse_privilege_removal_failed");
                }
                if (TokenContainsTraverse(token)) throw new InvalidOperationException("traverse_privilege_still_present");
            } finally { CloseHandle(token); }
        }

        static Exception WindowsFailure(string operation,int error) {
            var failure=new InvalidOperationException(operation);
            failure.Data["Win32Error"]=error;
            return failure;
        }
        static RawSecurityDescriptor ReadDescriptor(SafeFileHandle handle) {
            IntPtr owner,group,dacl,sacl,descriptor;
            uint status=GetSecurityInfo(handle,1,7,out owner,out group,out dacl,out sacl,out descriptor);
            if (status!=0) throw WindowsFailure("root_acl_query_failed",(int)status);
            try {
                uint length=GetSecurityDescriptorLength(descriptor);
                if (length<20 || length>1048576 || dacl==IntPtr.Zero) throw new InvalidOperationException("root_acl_invalid");
                var bytes=new byte[length]; Marshal.Copy(descriptor,bytes,0,(int)length);
                return new RawSecurityDescriptor(bytes,0);
            } finally { LocalFree(descriptor); }
        }
        static byte[] AceBytes(GenericAce ace) { var bytes=new byte[ace.BinaryLength];ace.GetBinaryForm(bytes,0);return bytes; }
        static bool SameBytes(byte[] left,byte[] right) {
            if (left.Length!=right.Length) return false;
            for(int i=0;i<left.Length;i++) if(left[i]!=right[i]) return false;
            return true;
        }
        public static bool EnsureFixedRootDeny(string path,string sid,string installationId) {
            return EnsureFixedRootDenyWithReport(path,sid,installationId).Changed;
        }
        public static RootDenyResult EnsureFixedRootDenyWithReport(string path,string sid,string installationId) {
            if (path!="C:\\Users\\Borinio" && path!="F:\\Claude") throw new InvalidOperationException("isolation_root_refused");
            LocalAccount.RequireOwned(sid,installationId);
            return EnsureRootOnlyDeny(path,new SecurityIdentifier(sid));
        }
        static bool CompatibleRootControl(ControlFlags before,ControlFlags after) {
            // The legacy file setter may clear only the modern inheritance-model marker.
            // This does not permit setting that bit or changing Protected, Present, or any other bit.
            // https://learn.microsoft.com/windows-hardware/drivers/ifs/security-descriptor-control
            return after==before || (int)after==((int)before&~0x0400);
        }
        static RootDenyResult RootResult(bool changed,ControlFlags before,ControlFlags after) {
            return new RootDenyResult { Changed=changed,ControlBefore=(int)before,ControlAfter=(int)after,
                LegacyAutoInheritedCleared=((int)before&0x0400)!=0 && ((int)after&0x0400)==0 };
        }
        static bool HasRootDeny(RawSecurityDescriptor descriptor,SecurityIdentifier identifier) {
            foreach(GenericAce ace in descriptor.DiscretionaryAcl) {
                var known=ace as CommonAce;
                if(known!=null && known.AceQualifier==AceQualifier.AccessDenied && known.SecurityIdentifier.Equals(identifier) &&
                   (known.AceFlags&AceFlags.InheritOnly)==0 && (known.AccessMask&0x1f01ff)==0x1f01ff) return true;
            }
            return false;
        }
        // Private helper is exercised only on owned temporary directories by offline tests.
        // All production calls pass the fixed-root and exact-account guards above.
        static RootDenyResult EnsureRootOnlyDeny(string path,SecurityIdentifier identifier) {
            if ((File.GetAttributes(path)&FileAttributes.ReparsePoint)!=0) throw new InvalidOperationException("isolation_root_reparse_refused");
            // Existing deny needs only READ_CONTROL; do not request DELETE/data rights on busy roots.
            using(var query=CreateFile(path,0x20000,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero)) {
                if(query.IsInvalid) throw WindowsFailure("isolation_root_query_open_failed",Marshal.GetLastWin32Error());
                var current=ReadDescriptor(query);
                if(HasRootDeny(current,identifier)) return RootResult(false,current.ControlFlags,current.ControlFlags);
            }
            // READ_CONTROL|WRITE_DAC, no FILE_SHARE_DELETE: pin this exact directory name while
            // the path-based setter runs. Never use MAXIMUM_ALLOWED (DELETE causes sharing error 32).
            using(var handle=CreateFile(path,0x60000,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero)) {
                if(handle.IsInvalid) throw WindowsFailure("isolation_root_open_failed",Marshal.GetLastWin32Error());
                if ((File.GetAttributes(path)&FileAttributes.ReparsePoint)!=0) throw new InvalidOperationException("isolation_root_reparse_refused");
                var before=ReadDescriptor(handle);
                if(HasRootDeny(before,identifier)) return RootResult(false,before.ControlFlags,before.ControlFlags);
                var updated=new RawAcl(before.DiscretionaryAcl.Revision,before.DiscretionaryAcl.Count+1);
                updated.InsertAce(0,new CommonAce(AceFlags.None,AceQualifier.AccessDenied,0x1f01ff,identifier,false,null));
                for(int i=0;i<before.DiscretionaryAcl.Count;i++) updated.InsertAce(i+1,before.DiscretionaryAcl[i]);
                var replacement=new RawSecurityDescriptor(before.ControlFlags,before.Owner,before.Group,before.SystemAcl,updated);
                var bytes=new byte[replacement.BinaryLength];replacement.GetBinaryForm(bytes,0);var pinned=GCHandle.Alloc(bytes,GCHandleType.Pinned);
                try {
                    // Deliberate use of the documented legacy API: unlike SetSecurityInfo, it does
                    // NOT propagate directory security to children. DACL only; no owner/group/SACL update.
                    // https://learn.microsoft.com/windows/win32/api/securitybaseapi/nf-securitybaseapi-setfilesecurityw
                    if(!SetFileSecurityW(path,4,pinned.AddrOfPinnedObject()))
                        throw WindowsFailure("root_only_deny_write_failed",Marshal.GetLastWin32Error());
                } finally { pinned.Free(); }
                var after=ReadDescriptor(handle);
                if(!CompatibleRootControl(before.ControlFlags,after.ControlFlags) || !Object.Equals(after.Owner,before.Owner) || !Object.Equals(after.Group,before.Group))
                    throw new InvalidOperationException("root_acl_control_or_identity_changed");
                if(after.DiscretionaryAcl.Count!=updated.Count) throw new InvalidOperationException("root_only_deny_readback_failed");
                for(int i=0;i<updated.Count;i++) if(!SameBytes(AceBytes(updated[i]),AceBytes(after.DiscretionaryAcl[i])))
                    throw new InvalidOperationException("root_acl_other_rules_changed");
                return RootResult(true,before.ControlFlags,after.ControlFlags);
            }
        }
        [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
            public long ProcessTime, JobTime; public uint Flags;
            public UIntPtr MinWorkingSet, MaxWorkingSet; public uint ActiveProcesses;
            public UIntPtr Affinity; public uint Priority, Scheduling;
        }
        [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong A,B,C,D,E,F; }
        [StructLayout(LayoutKind.Sequential)] struct Limits {
            public BasicLimits Basic; public IoCounters Io;
            public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
        }

        // Opens a read-capable handle but NEVER reads file/directory contents.
        public static bool ReadAccessDenied(string path) {
            using (var handle = CreateFile(path, 0x80000000, 7, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero)) {
                if (!handle.IsInvalid) return false;
                if (Marshal.GetLastWin32Error() != 5) throw new InvalidOperationException("deny_probe_not_access_denied");
                return true;
            }
        }
        static string Drain(StreamReader reader, int limit) {
            var result = new StringBuilder(); var buffer = new char[1024]; int read;
            while ((read = reader.Read(buffer, 0, buffer.Length)) > 0) {
                int keep = Math.Min(read, limit - result.Length);
                if (keep > 0) result.Append(buffer, 0, keep);
            }
            return result.ToString();
        }
        public static ProcessResult Run(ProcessStartInfo info, string input, int timeoutSeconds) {
            return Run(info,input,timeoutSeconds,false);
        }
        public static ProcessResult Run(ProcessStartInfo info, string input, int timeoutSeconds, bool requireTraverseRemoved) {
            if(requireTraverseRemoved && (!String.IsNullOrEmpty(info.UserName) || TraverseBypassPresent()))
                throw new InvalidOperationException("restricted_child_parent_invalid");
            info.UseShellExecute=false; info.CreateNoWindow=true;
            info.RedirectStandardInput=true; info.RedirectStandardOutput=true; info.RedirectStandardError=true;
            info.StandardOutputEncoding=new UTF8Encoding(false); info.StandardErrorEncoding=new UTF8Encoding(false);
            IntPtr job=CreateJobObject(IntPtr.Zero, null);
            if (job==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
            var limits=new Limits(); limits.Basic.Flags=0x2000 | 0x8 | 0x200;
            limits.Basic.ActiveProcesses=4; limits.JobMemory=new UIntPtr(536870912);
            if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(Limits)))) {
                CloseHandle(job); throw new InvalidOperationException("job_limits_failed");
            }
            using (var process=new Process()) {
                process.StartInfo=info;
                try {
                    if (!process.Start()) throw new InvalidOperationException("process_start_failed");
                    if (!AssignProcessToJobObject(job,process.Handle)) {
                        process.Kill(); throw new InvalidOperationException("process_isolation_failed");
                    }
                    if(requireTraverseRemoved && ProcessContainsTraverse(process.Handle)) {
                        process.Kill(); throw new InvalidOperationException("child_traverse_privilege_present");
                    }
                    var output=Task.Run(() => Drain(process.StandardOutput,16384));
                    var errors=Task.Run(() => Drain(process.StandardError,4096));
                    if (input!=null) process.StandardInput.WriteLine(input);
                    process.StandardInput.Close();
                    bool finished=process.WaitForExit(timeoutSeconds*1000);
                    if (!finished) { CloseHandle(job); job=IntPtr.Zero; process.WaitForExit(5000); }
                    Task.WaitAll(new Task[]{output,errors},5000);
                    return new ProcessResult { ExitCode=finished ? process.ExitCode : 124,
                        TimedOut=!finished, Output=output.IsCompleted ? output.Result : "",TraverseBypassRemoved=requireTraverseRemoved };
                } finally { if (job!=IntPtr.Zero) CloseHandle(job); }
            }
        }
    }
}
