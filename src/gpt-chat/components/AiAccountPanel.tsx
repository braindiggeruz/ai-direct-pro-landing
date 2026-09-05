import { useEffect, useState } from 'react';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import type { Locale } from '../types';
import type { ChatStrings } from '../i18n';
export interface AccountView {
  ok: boolean;
  loginAvailable: boolean;
  mode: "test" | "live" | null;
  providers: Array<"click" | "payme">;
  user: { signedIn: boolean } | null;
  remaining?: number;
  terms: { ru: string | null; uz: string | null };
  access?: {
    order_id: string;
    ends_at: number;
    remaining: number;
    renewSoon: boolean;
    refund_requested_at: number | null;
  } | null;
  payment?: { id: string; state: string } | null;
  scheduled?: { starts_at: number } | null;
  receipts?: Array<{ kind: string; receipt_url: string }>;
  refundable?: Array<{
    order_id: string;
    starts_at: number;
    refund_requested_at: number | null;
  }>;
}

// UI-only release. Consumer billing remains in the separate, unreleased workstream.
// No account API, authentication, schema bootstrap or checkout runs in this release.
export function AiAccountPanel({ t, locale, openRequest = 0 }: {
  t: ChatStrings; locale: Locale; apiBase: string;
  onAccount: (account: AccountView) => void; refreshKey: number; openRequest?: number;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (openRequest) setOpen(true); }, [openRequest]);
  const uz = locale === 'uz';
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="secondary" className="gpt-account-trigger" aria-label={uz ? 'GPTBot Plus — tez orada' : 'GPTBot Plus — скоро'}><Sparkles data-icon="inline-start" /><span>Plus</span></Button></DialogTrigger>
    <DialogContent className="gpt-account-dialog ym-hide-content">
      <Badge variant="secondary">GPTBot Plus · {uz ? 'Tez orada' : 'Скоро'}</Badge>
      <DialogTitle>{uz ? 'Ko‘proq imkoniyatlar tayyorlanmoqda' : 'Готовим больше возможностей'}</DialogTitle>
      <DialogDescription>{uz ? 'To‘lov hali yoqilmagan. Hozir bepul limit doirasida chatdan foydalanishingiz mumkin.' : 'Оплата пока не подключена. Сейчас можно общаться в пределах бесплатного лимита.'}</DialogDescription>
      <Card className="gpt-plan-card"><CardHeader><CardTitle>{uz ? 'Rejalashtirilgan Plus' : 'Планируемый Plus'}</CardTitle></CardHeader>
        <CardContent><p>{t.premium.price}</p><p className="gpt-panel-note">{t.premium.benefits}</p></CardContent>
        <CardFooter><p className="gpt-panel-note">{uz ? 'Tarif ishga tushgach, yakuniy shartlar va to‘lov usullari shu yerda bo‘ladi.' : 'После запуска здесь появятся окончательные условия и способы оплаты.'}</p></CardFooter>
      </Card>
      <Button onClick={() => setOpen(false)}>{uz ? 'Chatni davom ettirish' : 'Продолжить общение'}</Button>
      <p className="gpt-panel-note">{t.loginToSave}</p>
    </DialogContent>
  </Dialog>;
}
