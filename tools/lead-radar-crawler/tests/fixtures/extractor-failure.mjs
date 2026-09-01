// Local subprocess failure fixture only; never bundled into the installed app.
let input = '';
for await (const chunk of process.stdin) input += chunk;
const parsed = JSON.parse(input);
const mode = parsed.result.pages?.[0]?.html?.includes('extractor-test-timeout') ? 'timeout' : parsed.result.reason;
if (mode === 'overflow') process.stdout.write('x'.repeat(70_000));
else if (mode === 'stderr_overflow') process.stderr.write('x'.repeat(8_192));
else if (mode === 'timeout') setTimeout(() => process.stdout.write('{}'), 30_000);
else if (mode === 'raw') process.stdout.write(JSON.stringify(JSON.parse(input).result));
else process.stdout.write('not-json');
