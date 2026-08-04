/**
 * The private seller's half of Bormi: compose a listing, watch it through
 * moderation, correct it, take it down, and answer whoever writes in.
 *
 * A private seller has no store, no organisation and no membership. Everything
 * here authorises on the seller profile the server derives from the Telegram
 * identity that launched the Mini App, so the person is never asked to create a
 * shop, and never shown a membership error for something that is not about
 * membership.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MarketApiError, compressImage, marketApi, uploadPrivateMedia } from '../lib/api';
import { formatPrice } from '../lib/i18n';
import { useBackStop } from '../platform/navigation';
import { haptic } from '../platform/telegram';
import type {
  ClassifiedCategory,
  ClassifiedCondition,
  ClassifiedLocation,
  Locale,
  ModerationReasonCode,
  SellerInquiry,
  SellerListing,
  SellerListingState,
  SellerProfile,
} from '../types';
import {
  AsyncImage,
  Badge,
  Button,
  ConfirmDialog,
  ErrorView,
  Field,
  Icon,
  Modal,
  SkeletonList,
  StateView,
} from '../components/ui';

type Page<T> = { items: T[]; nextCursor: string | null };
type View = 'listings' | 'composer' | 'inquiries';

const MAX_PHOTOS = 5;
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 2000;
const REPLY_MAX = 500;
const DRAFT_KEY = 'bormi.classifieds.draft';
const DRAFT_VERSION = 1;
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AUTOSAVE_MS = 400;

const CONTACT_MODES = ['in_app', 'telegram_relay', 'phone_optional'] as const;
type ContactMode = (typeof CONTACT_MODES)[number];

const words = {
  ru: {
    sell: 'Продать', myListings: 'Мои объявления', inquiries: 'Обращения',
    newListing: 'Новое объявление', back: 'Назад', close: 'Закрыть',
    photos: 'Фотографии', photosHint: 'До 5 фотографий. Первая станет обложкой.',
    addPhoto: 'Добавить фото', removePhoto: 'Удалить фотографию',
    title: 'Название', titleHint: 'Коротко и по делу — что вы продаёте',
    description: 'Описание', descriptionHint: 'Состояние, комплектация, причина продажи',
    price: 'Цена, сум', priceHint: 'Только целые суммы',
    category: 'Категория', condition: 'Состояние', district: 'Район Ташкента',
    locality: 'Ориентир (необязательно)', localityHint: 'Например, рядом с метро Чиланзар',
    contact: 'Способ связи',
    contactInApp: 'Только переписка в Bormi',
    contactRelay: 'Переписка в Bormi и Telegram',
    contactPhone: 'Телефон после запроса покупателя',
    contactHint: 'Номер телефона не публикуется и не хранится в объявлении.',
    preview: 'Предпросмотр', previewHint: 'Так объявление увидит покупатель.',
    submit: 'Отправить на модерацию', saveChanges: 'Сохранить и отправить снова',
    submitting: 'Отправляем…', chooseFirst: 'Заполните обязательные поля',
    required: 'Обязательное поле', pickCategory: 'Выберите категорию',
    pickDistrict: 'Выберите район', pickCondition: 'Выберите состояние',
    needPhoto: 'Добавьте хотя бы одну фотографию',
    priceInvalid: 'Укажите цену числом',
    sentTitle: 'Объявление отправлено на модерацию',
    sentBody: 'Мы проверим его и сообщим о результате. Обычно это занимает немного времени.',
    openMine: 'Открыть «Мои объявления»',
    draftFound: 'Мы сохранили черновик', draftRestore: 'Продолжить',
    draftDiscard: 'Начать заново',
    leaveTitle: 'Выйти без отправки?',
    leaveBody: 'Черновик сохранится на этом устройстве.',
    leaveConfirm: 'Выйти', leaveCancel: 'Остаться',
    empty: 'У вас пока нет объявлений',
    emptyBody: 'Нажмите «Подать», чтобы создать первое.',
    inquiriesEmpty: 'Обращений пока нет',
    inquiriesEmptyBody: 'Здесь появятся вопросы покупателей.',
    edit: 'Изменить', resubmit: 'Отправить снова', unpublish: 'Снять с публикации',
    republish: 'Опубликовать снова', archive: 'В архив',
    archiveTitle: 'Отправить в архив?',
    archiveBody: 'Объявление исчезнет из поиска. Вернуть его нельзя.',
    archiveConfirm: 'В архив', cancel: 'Отмена',
    reply: 'Ответить', replyPlaceholder: 'Ваш ответ покупателю',
    send: 'Отправить', closeInquiry: 'Закрыть обращение',
    buyerAsked: 'Вопрос покупателя', yourReply: 'Ваш ответ',
    inquiryCount: 'Обращений', staleTitle: 'Объявление изменилось',
    staleBody: 'Мы обновили данные. Проверьте и повторите.',
    profileName: 'Как вас видят покупатели',
    profileNameHint: 'Публичное имя. Телефон и Telegram не показываются.',
    profileContinue: 'Продолжить', retry: 'Повторить',
    uploadFailed: 'Не удалось загрузить фото. Попробуйте ещё раз.',
    tooManyPhotos: 'Можно добавить не больше пяти фотографий',
    restrictedSeller: 'Публикация временно недоступна',
    restrictedSellerBody: 'Ваш профиль ограничен. Обратитесь в поддержку.',
  },
  uz: {
    sell: 'Sotish', myListings: 'Mening e’lonlarim', inquiries: 'Murojaatlar',
    newListing: 'Yangi e’lon', back: 'Orqaga', close: 'Yopish',
    photos: 'Suratlar', photosHint: '5 tagacha surat. Birinchisi muqova bo‘ladi.',
    addPhoto: 'Surat qo‘shish', removePhoto: 'Suratni o‘chirish',
    title: 'Nomi', titleHint: 'Qisqa va aniq — nima sotyapsiz',
    description: 'Tavsif', descriptionHint: 'Holati, to‘plami, sotish sababi',
    price: 'Narxi, so‘m', priceHint: 'Faqat butun son',
    category: 'Toifa', condition: 'Holati', district: 'Toshkent tumani',
    locality: 'Mo‘ljal (ixtiyoriy)', localityHint: 'Masalan, Chilonzor metrosi yonida',
    contact: 'Bog‘lanish usuli',
    contactInApp: 'Faqat Bormi orqali yozishma',
    contactRelay: 'Bormi va Telegram orqali',
    contactPhone: 'Xaridor so‘ragach telefon',
    contactHint: 'Telefon raqami e’londa chop etilmaydi va saqlanmaydi.',
    preview: 'Ko‘rib chiqish', previewHint: 'Xaridor e’lonni shunday ko‘radi.',
    submit: 'Moderatsiyaga yuborish', saveChanges: 'Saqlab, qayta yuborish',
    submitting: 'Yuborilmoqda…', chooseFirst: 'Majburiy maydonlarni to‘ldiring',
    required: 'Majburiy maydon', pickCategory: 'Toifani tanlang',
    pickDistrict: 'Tumanni tanlang', pickCondition: 'Holatini tanlang',
    needPhoto: 'Kamida bitta surat qo‘shing',
    priceInvalid: 'Narxni raqam bilan kiriting',
    sentTitle: 'E’lon moderatsiyaga yuborildi',
    sentBody: 'Tekshirib, natijani bildiramiz. Bu odatda ko‘p vaqt olmaydi.',
    openMine: '«Mening e’lonlarim»ni ochish',
    draftFound: 'Qoralama saqlangan', draftRestore: 'Davom etish',
    draftDiscard: 'Boshidan boshlash',
    leaveTitle: 'Yubormasdan chiqasizmi?',
    leaveBody: 'Qoralama shu qurilmada saqlanadi.',
    leaveConfirm: 'Chiqish', leaveCancel: 'Qolish',
    empty: 'Hozircha e’lonlaringiz yo‘q',
    emptyBody: 'Birinchisini yaratish uchun «Berish»ni bosing.',
    inquiriesEmpty: 'Hozircha murojaat yo‘q',
    inquiriesEmptyBody: 'Xaridorlar savollari shu yerda ko‘rinadi.',
    edit: 'O‘zgartirish', resubmit: 'Qayta yuborish', unpublish: 'Chop etishdan olish',
    republish: 'Qayta chop etish', archive: 'Arxivga',
    archiveTitle: 'Arxivga yuborilsinmi?',
    archiveBody: 'E’lon qidiruvdan yo‘qoladi. Uni qaytarib bo‘lmaydi.',
    archiveConfirm: 'Arxivga', cancel: 'Bekor qilish',
    reply: 'Javob berish', replyPlaceholder: 'Xaridorga javobingiz',
    send: 'Yuborish', closeInquiry: 'Murojaatni yopish',
    buyerAsked: 'Xaridor savoli', yourReply: 'Sizning javobingiz',
    inquiryCount: 'Murojaatlar', staleTitle: 'E’lon o‘zgardi',
    staleBody: 'Ma’lumotni yangiladik. Tekshirib, qaytadan urinib ko‘ring.',
    profileName: 'Xaridorlar sizni qanday ko‘radi',
    profileNameHint: 'Ommaviy ism. Telefon va Telegram ko‘rsatilmaydi.',
    profileContinue: 'Davom etish', retry: 'Qayta urinish',
    uploadFailed: 'Suratni yuklab bo‘lmadi. Qaytadan urinib ko‘ring.',
    tooManyPhotos: 'Beshtadan ortiq surat qo‘shib bo‘lmaydi',
    restrictedSeller: 'Chop etish vaqtincha mavjud emas',
    restrictedSellerBody: 'Profilingiz cheklangan. Qo‘llab-quvvatlashga murojaat qiling.',
  },
} as const;

/**
 * The seller-facing name for each state.
 *
 * A raw enum on a screen is an internal detail leaking into somebody's day.
 * Every state gets a word in both languages, and the tone says whether the
 * person has something to do.
 */
const STATE_LABELS: Record<SellerListingState, {
  ru: string; uz: string; tone: 'positive' | 'warning' | 'negative' | 'neutral' | 'info';
}> = {
  draft: { ru: 'Черновик', uz: 'Qoralama', tone: 'neutral' },
  pending: { ru: 'На модерации', uz: 'Moderatsiyada', tone: 'info' },
  published: { ru: 'Опубликовано', uz: 'Chop etilgan', tone: 'positive' },
  needs_changes: { ru: 'Нужны исправления', uz: 'Tuzatish kerak', tone: 'warning' },
  restricted: { ru: 'Ограничено', uz: 'Cheklangan', tone: 'negative' },
  // The same words the Admin moderation queue uses for the same verdict, so a
  // support answer and the seller's screen cannot describe it differently.
  removed: { ru: 'Снято модератором', uz: 'Moderator olib tashladi', tone: 'negative' },
  unpublished: { ru: 'Снято с публикации', uz: 'Chop etishdan olingan', tone: 'neutral' },
  archived: { ru: 'В архиве', uz: 'Arxivda', tone: 'neutral' },
};

/**
 * Why a listing was refused, in words the seller can act on.
 *
 * The server sends a code, not a sentence, so both languages live here rather
 * than in the database, and an unrecognised code falls back to something
 * neutral instead of printing an internal string at somebody.
 */
const REASON_LABELS: Record<ModerationReasonCode, { ru: string; uz: string }> = {
  new_seller_review: {
    ru: 'Первое объявление проходит обычную проверку.',
    uz: 'Birinchi e’lon odatdagi tekshiruvdan o‘tadi.',
  },
  high_risk_category: {
    ru: 'Эта категория проверяется внимательнее.',
    uz: 'Bu toifa diqqat bilan tekshiriladi.',
  },
  prohibited_item: {
    ru: 'Такие товары нельзя продавать в Bormi.',
    uz: 'Bunday tovarlarni Bormi’da sotib bo‘lmaydi.',
  },
  suspected_fraud: {
    ru: 'Объявление похоже на небезопасное предложение.',
    uz: 'E’lon xavfli taklifga o‘xshaydi.',
  },
  duplicate_listing: {
    ru: 'У вас уже есть такое же объявление.',
    uz: 'Sizda xuddi shunday e’lon bor.',
  },
  misleading_content: {
    ru: 'Описание или фотографии не соответствуют товару.',
    uz: 'Tavsif yoki suratlar tovarga mos emas.',
  },
  unsafe_contact: {
    ru: 'Уберите небезопасный способ связи из текста.',
    uz: 'Matndan xavfli bog‘lanish usulini olib tashlang.',
  },
  personal_data: {
    ru: 'Уберите личные данные из описания.',
    uz: 'Tavsifdan shaxsiy ma’lumotlarni olib tashlang.',
  },
  seller_request: {
    ru: 'Изменено по вашей просьбе.',
    uz: 'Sizning so‘rovingiz bo‘yicha o‘zgartirildi.',
  },
  appeal_upheld: {
    ru: 'Решение пересмотрено в вашу пользу.',
    uz: 'Qaror foydangizga qayta ko‘rib chiqildi.',
  },
  other_policy: {
    ru: 'Объявление не соответствует правилам Bormi.',
    uz: 'E’lon Bormi qoidalariga mos emas.',
  },
};

const CONDITION_LABELS: Record<ClassifiedCondition, { ru: string; uz: string }> = {
  new: { ru: 'Новое', uz: 'Yangi' },
  like_new: { ru: 'Как новое', uz: 'Yangidek' },
  good: { ru: 'Хорошее', uz: 'Yaxshi' },
  fair: { ru: 'Удовлетворительное', uz: 'Qoniqarli' },
  for_parts: { ru: 'На запчасти', uz: 'Ehtiyot qismlar uchun' },
  not_applicable: { ru: 'Не применяется', uz: 'Qo‘llanmaydi' },
};

interface Draft {
  version: number;
  createdAt: number;
  updatedAt: number;
  title: string;
  description: string;
  priceInput: string;
  categoryId: string;
  condition: string;
  districtId: string;
  locality: string;
  contactMode: ContactMode;
  /**
   * References only, never bytes. A base64 photograph in localStorage is both a
   * quota problem and a copy of somebody's picture living longer than they
   * expect; the reference points at an object the server already holds.
   */
  mediaRefs: string[];
}

function digitsOf(value: string): string {
  return value.replace(/\D+/g, '').replace(/^0+(?=\d)/, '').slice(0, 15);
}

function groupDigits(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function emptyDraft(): Draft {
  return {
    version: DRAFT_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: '', description: '', priceInput: '', categoryId: '', condition: '',
    districtId: '', locality: '', contactMode: 'in_app', mediaRefs: [],
  };
}

function readDraft(): Draft | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Draft>;
    // Fail closed on anything unexpected. A half-understood draft restored into
    // the form is worse than none: the person cannot tell which of their own
    // words survived.
    if (parsed?.version !== DRAFT_VERSION) throw new Error('version');
    if (typeof parsed.updatedAt !== 'number') throw new Error('shape');
    if (Date.now() - parsed.updatedAt > DRAFT_TTL_MS) throw new Error('expired');
    const media = Array.isArray(parsed.mediaRefs)
      ? parsed.mediaRefs.filter((ref): ref is string => typeof ref === 'string').slice(0, MAX_PHOTOS)
      : [];
    const contactMode = CONTACT_MODES.includes(parsed.contactMode as ContactMode)
      ? parsed.contactMode as ContactMode
      : 'in_app';
    return {
      version: DRAFT_VERSION,
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : parsed.updatedAt,
      updatedAt: parsed.updatedAt,
      title: typeof parsed.title === 'string' ? parsed.title.slice(0, TITLE_MAX) : '',
      description: typeof parsed.description === 'string'
        ? parsed.description.slice(0, DESCRIPTION_MAX)
        : '',
      priceInput: typeof parsed.priceInput === 'string' ? digitsOf(parsed.priceInput) : '',
      categoryId: typeof parsed.categoryId === 'string' ? parsed.categoryId : '',
      condition: typeof parsed.condition === 'string' ? parsed.condition : '',
      districtId: typeof parsed.districtId === 'string' ? parsed.districtId : '',
      locality: typeof parsed.locality === 'string' ? parsed.locality.slice(0, 120) : '',
      contactMode,
      mediaRefs: media,
    };
  } catch {
    discardDraft();
    return null;
  }
}

function discardDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // A private-mode WebView can refuse storage. The composer still works; only
    // recovery is lost, and nothing is reported as saved that was not.
  }
}

function writeDraft(draft: Draft): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, updatedAt: Date.now() }));
  } catch {
    // Same as above: storage is a convenience here, never the source of truth.
  }
}

function draftIsEmpty(draft: Draft): boolean {
  return !draft.title.trim()
    && !draft.description.trim()
    && !draft.priceInput
    && !draft.categoryId
    && !draft.districtId
    && draft.mediaRefs.length === 0;
}

function listingToDraft(listing: SellerListing): Draft {
  return {
    version: DRAFT_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: listing.name,
    description: listing.description ?? '',
    priceInput: String(listing.priceMinor),
    categoryId: listing.category?.id ?? '',
    condition: listing.condition ?? '',
    districtId: listing.location?.districtId ?? '',
    locality: listing.location?.localityText ?? '',
    contactMode: (listing.contactMode ?? 'in_app') as ContactMode,
    mediaRefs: [],
  };
}

export function ClassifiedsSeller({
  locale,
  categories,
  locations,
  onClose,
  initialView = 'listings',
}: {
  locale: Locale;
  categories: ClassifiedCategory[];
  locations: ClassifiedLocation[];
  onClose: () => void;
  initialView?: View;
}) {
  const w = words[locale];
  const client = useQueryClient();
  const [view, setView] = useState<View>(initialView);
  const [editing, setEditing] = useState<SellerListing | null>(null);
  const [submitted, setSubmitted] = useState<SellerListing | null>(null);

  const profile = useQuery({
    queryKey: ['classifieds-seller-profile'],
    queryFn: ({ signal }) =>
      marketApi.get<{ profile: SellerProfile | null }>('/classifieds/private/profile', signal),
  });
  const listings = useQuery({
    queryKey: ['classifieds-my-listings'],
    queryFn: ({ signal }) =>
      marketApi.get<Page<SellerListing>>('/classifieds/private/listings', signal),
    enabled: Boolean(profile.data?.profile),
  });
  const inquiries = useQuery({
    queryKey: ['classifieds-seller-inquiries'],
    queryFn: ({ signal }) =>
      marketApi.get<Page<SellerInquiry>>('/classifieds/private/inquiries', signal),
    enabled: Boolean(profile.data?.profile),
  });

  useBackStop(view !== 'listings', `classifieds-seller:${view}`, () => {
    setEditing(null);
    setSubmitted(null);
    setView('listings');
  });

  const refreshAll = () => {
    void client.invalidateQueries({ queryKey: ['classifieds-my-listings'] });
    void client.invalidateQueries({ queryKey: ['classifieds-seller-inquiries'] });
    // The buyer's own search is stale the moment a listing changes state.
    void client.invalidateQueries({ queryKey: ['classifieds-listings'] });
  };

  if (profile.isLoading) return <SkeletonList count={2} />;
  if (profile.isError) {
    return <ErrorView locale={locale} retry={() => void profile.refetch()} />;
  }

  // No profile yet: this person has never sold anything. They are asked for one
  // public name and nothing else — no store, no membership, no Telegram id.
  if (!profile.data?.profile) {
    return <SellerOnboarding
      locale={locale}
      onCreated={() => void profile.refetch()}
      onCancel={onClose}
    />;
  }

  const seller = profile.data.profile;
  const canPublish = seller.status === 'active' && seller.moderationState === 'clear';

  if (view === 'composer') {
    return <Composer
      locale={locale}
      categories={categories}
      locations={locations}
      listing={editing}
      onCancel={() => { setEditing(null); setView('listings'); }}
      onSubmitted={(listing) => {
        setEditing(null);
        setSubmitted(listing);
        refreshAll();
        setView('listings');
      }}
    />;
  }

  return <div className="stack">
    <div className="segmented" role="group" aria-label={w.myListings}>
      <button type="button" aria-pressed={view === 'listings'} onClick={() => setView('listings')}>
        {w.myListings}
      </button>
      <button type="button" aria-pressed={view === 'inquiries'} onClick={() => setView('inquiries')}>
        {w.inquiries}
        {inquiries.data?.items.some((item) => item.status === 'open')
          ? <span className="cabinet-row__count">
            {inquiries.data.items.filter((item) => item.status === 'open').length}
          </span>
          : null}
      </button>
    </div>

    {submitted ? <div className="notice" role="status">
      <Icon name="check" size={19} />
      <div className="stack stack--tight">
        <strong>{w.sentTitle}</strong>
        <small>{w.sentBody}</small>
      </div>
    </div> : null}

    {!canPublish ? <StateView
      icon="warning"
      title={w.restrictedSeller}
      body={w.restrictedSellerBody}
    /> : null}

    {view === 'listings' ? <section className="section">
      {canPublish ? <Button wide onClick={() => { setEditing(null); setView('composer'); }}>
        <Icon name="plus" size={18} />{w.newListing}
      </Button> : null}
      {listings.isLoading ? <SkeletonList count={2} />
        : listings.isError ? <ErrorView locale={locale} retry={() => void listings.refetch()} />
          : listings.data?.items.length
            ? <div className="stack">{listings.data.items.map((listing) => <ListingRow
              key={listing.id}
              locale={locale}
              listing={listing}
              canPublish={canPublish}
              onEdit={() => { setEditing(listing); setView('composer'); }}
              onChanged={refreshAll}
            />)}</div>
            : <StateView icon="products" title={w.empty} body={w.emptyBody} />}
    </section> : null}

    {view === 'inquiries' ? <section className="section">
      {inquiries.isLoading ? <SkeletonList count={2} />
        : inquiries.isError ? <ErrorView locale={locale} retry={() => void inquiries.refetch()} />
          : inquiries.data?.items.length
            ? <div className="stack">{inquiries.data.items.map((inquiry) => <InquiryRow
              key={inquiry.id}
              locale={locale}
              inquiry={inquiry}
              onChanged={refreshAll}
            />)}</div>
            : <StateView icon="help" title={w.inquiriesEmpty} body={w.inquiriesEmptyBody} />}
    </section> : null}
  </div>;
}

/**
 * The whole of becoming a seller: one public name.
 *
 * Deliberately not a store, a membership or a verification step. A person who
 * wants to sell one bicycle should not be asked to found a business.
 */
function SellerOnboarding({
  locale, onCreated, onCancel,
}: { locale: Locale; onCreated: () => void; onCancel: () => void }) {
  const w = words[locale];
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: (displayName: string) =>
      marketApi.post<{ profile: SellerProfile }>(
        '/classifieds/private/profile', { displayName },
      ),
    onSuccess: () => { haptic('success'); onCreated(); },
    onError: () => { haptic('error'); setError(w.retry); },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 2) { setError(w.required); return; }
    setError('');
    create.mutate(trimmed);
  };
  return <form className="section stack" onSubmit={submit}>
    <h1>{w.sell}</h1>
    <Field label={w.profileName} hint={w.profileNameHint} error={error || undefined}>
      <input
        value={name}
        onChange={(event) => setName(event.target.value.slice(0, 80))}
        maxLength={80}
        autoComplete="off"
        enterKeyHint="done"
      />
    </Field>
    <Button type="submit" wide pending={create.isPending}>{w.profileContinue}</Button>
    <Button type="button" variant="secondary" wide onClick={onCancel}>{w.cancel}</Button>
  </form>;
}

function ListingRow({
  locale, listing, canPublish, onEdit, onChanged,
}: {
  locale: Locale;
  listing: SellerListing;
  canPublish: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const w = words[locale];
  const label = STATE_LABELS[listing.state];
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [stale, setStale] = useState(false);

  const transition = useMutation({
    mutationFn: (command: 'resubmit' | 'unpublish' | 'republish' | 'archive') =>
      marketApi.post<{ listing: SellerListing }>(
        `/classifieds/private/listings/${listing.id}/${command}`,
        { expectedVersion: listing.version },
      ),
    onSuccess: () => { haptic('success'); setConfirmArchive(false); onChanged(); },
    onError: (error) => {
      haptic('error');
      setConfirmArchive(false);
      // A 409 means somebody moved this listing — usually a moderator deciding
      // while the seller was looking at it. Refetch rather than retry blindly.
      if (error instanceof MarketApiError && error.status === 409) {
        setStale(true);
        onChanged();
      }
    },
  });

  // The reason is only worth showing when it explains something the seller did
  // not choose. `seller_request` is their own action reflected back at them.
  const reason = listing.moderation?.reasonCode;
  const showReason = reason
    && reason !== 'seller_request'
    && (listing.state === 'needs_changes'
      || listing.state === 'restricted'
      || listing.state === 'removed');

  return <article className="card">
    <div className="card__body stack">
      <div className="row row--between">
        <strong>{listing.name}</strong>
        <Badge tone={label.tone}>{label[locale]}</Badge>
      </div>
      <div className="row">
        {listing.mediaHandles[0] ? <AsyncImage
          handle={listing.mediaHandles[0]}
          source="classifieds"
          alt={listing.name}
          className="listing-thumb"
        /> : null}
        <div className="stack stack--tight">
          <strong>{formatPrice(listing.priceMinor, locale)}</strong>
          {listing.location
            ? <small>{locale === 'ru'
              ? listing.location.districtNameRu
              : listing.location.districtNameUz}</small>
            : null}
          {/* Real counts only: a listing nobody wrote to shows nothing here. */}
          {listing.inquiries.total > 0
            ? <small>{w.inquiryCount}: {listing.inquiries.total}</small>
            : null}
        </div>
      </div>

      {showReason ? <p className="cabinet-note" role="status">
        {REASON_LABELS[reason]?.[locale] ?? REASON_LABELS.other_policy[locale]}
      </p> : null}
      {stale ? <p className="cabinet-note" role="alert">{w.staleBody}</p> : null}

      <div className="row row--wrap">
        {canPublish && listing.state !== 'archived' && listing.state !== 'removed'
          ? <Button variant="secondary" onClick={onEdit}>{w.edit}</Button>
          : null}
        {canPublish && listing.state === 'needs_changes' ? <Button
          pending={transition.isPending}
          onClick={() => transition.mutate('resubmit')}
        >{w.resubmit}</Button> : null}
        {canPublish && listing.state === 'published' ? <Button
          variant="secondary"
          pending={transition.isPending}
          onClick={() => transition.mutate('unpublish')}
        >{w.unpublish}</Button> : null}
        {canPublish && listing.state === 'unpublished' ? <Button
          pending={transition.isPending}
          onClick={() => transition.mutate('republish')}
        >{w.republish}</Button> : null}
        {canPublish && listing.state !== 'archived' ? <Button
          variant="ghost"
          onClick={() => setConfirmArchive(true)}
        >{w.archive}</Button> : null}
      </div>
    </div>
    <ConfirmDialog
      open={confirmArchive}
      title={w.archiveTitle}
      body={w.archiveBody}
      confirmLabel={w.archiveConfirm}
      cancelLabel={w.cancel}
      pending={transition.isPending}
      onConfirm={() => transition.mutate('archive')}
      onCancel={() => setConfirmArchive(false)}
    />
  </article>;
}

function InquiryRow({
  locale, inquiry, onChanged,
}: { locale: Locale; inquiry: SellerInquiry; onChanged: () => void }) {
  const w = words[locale];
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');

  const send = useMutation({
    mutationFn: (text: string) => marketApi.post<{ inquiry: SellerInquiry }>(
      `/classifieds/private/inquiries/${inquiry.id}/reply`,
      { reply: text, expectedVersion: inquiry.version },
    ),
    onSuccess: () => { haptic('success'); setOpen(false); setReply(''); onChanged(); },
    onError: (caught) => {
      haptic('error');
      setError(caught instanceof MarketApiError && caught.status === 409 ? w.staleBody : w.retry);
      if (caught instanceof MarketApiError && caught.status === 409) onChanged();
    },
  });
  const closeInquiry = useMutation({
    mutationFn: () => marketApi.post<{ inquiry: SellerInquiry }>(
      `/classifieds/private/inquiries/${inquiry.id}/close`,
      { expectedVersion: inquiry.version },
    ),
    onSuccess: () => { haptic('success'); onChanged(); },
    onError: () => { haptic('error'); onChanged(); },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = reply.trim();
    if (trimmed.length < 2) { setError(w.required); return; }
    setError('');
    send.mutate(trimmed);
  };

  return <article className="card">
    <div className="card__body stack">
      <div className="row row--between">
        <strong>{inquiry.listing.name}</strong>
        <Badge tone={inquiry.status === 'answered'
          ? 'positive'
          : inquiry.status === 'open' ? 'warning' : 'neutral'}
        >
          {inquiry.status === 'answered'
            ? w.yourReply
            : inquiry.status === 'open' ? w.reply : w.close}
        </Badge>
      </div>
      <small>{w.buyerAsked}</small>
      <p>{inquiry.message}</p>
      {inquiry.reply ? <><small>{w.yourReply}</small><p>{inquiry.reply}</p></> : null}
      {inquiry.status !== 'closed' ? <div className="row row--wrap">
        <Button onClick={() => setOpen(true)}>{w.reply}</Button>
        <Button
          variant="ghost"
          pending={closeInquiry.isPending}
          onClick={() => closeInquiry.mutate()}
        >{w.closeInquiry}</Button>
      </div> : null}
    </div>
    <Modal open={open} title={w.reply} onClose={() => setOpen(false)} closeLabel={w.close}>
      <form className="stack" onSubmit={submit}>
        <Field label={w.yourReply} error={error || undefined}>
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value.slice(0, REPLY_MAX))}
            rows={4}
            maxLength={REPLY_MAX}
            placeholder={w.replyPlaceholder}
          />
        </Field>
        <Button type="submit" wide pending={send.isPending}>{w.send}</Button>
      </form>
    </Modal>
  </article>;
}

function Composer({
  locale, categories, locations, listing, onCancel, onSubmitted,
}: {
  locale: Locale;
  categories: ClassifiedCategory[];
  locations: ClassifiedLocation[];
  listing: SellerListing | null;
  onCancel: () => void;
  onSubmitted: (listing: SellerListing) => void;
}) {
  const w = words[locale];
  // Read once, on mount: `useRef(readDraft())` would re-read localStorage on
  // every render and throw away what the person has typed since.
  const recovered = useRef(listing ? null : readDraft()).current;
  const [draft, setDraft] = useState<Draft>(
    () => (listing ? listingToDraft(listing) : emptyDraft()),
  );
  const [recoveryOpen, setRecoveryOpen] = useState(
    Boolean(recovered && !draftIsEmpty(recovered)),
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  // One key per composer session, so a retried submit is the same command and
  // never creates a second listing.
  const idempotencyKey = useRef(crypto.randomUUID()).current;

  const dirty = !draftIsEmpty(draft);
  useBackStop(true, 'classifieds-composer', () => {
    if (dirty && !listing) setLeaveOpen(true);
    else onCancel();
  });

  // Autosave, debounced. Only for a new listing: an edit already has a server
  // copy, and writing it to this device would resurrect it into the next
  // unrelated composer session.
  useEffect(() => {
    if (listing) return;
    if (draftIsEmpty(draft)) return;
    const timer = window.setTimeout(() => writeDraft(draft), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, listing]);

  const conditions = useMemo(() => {
    const chosen = categories.find((entry) => entry.id === draft.categoryId);
    return chosen?.allowedConditions ?? [];
  }, [categories, draft.categoryId]);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const blob = await compressImage(file);
      return uploadPrivateMedia(blob);
    },
    onSuccess: ({ ref }) => {
      haptic('success');
      setUploadError('');
      setDraft((current) => ({
        ...current,
        mediaRefs: [...current.mediaRefs, ref].slice(0, MAX_PHOTOS),
      }));
    },
    onError: () => { haptic('error'); setUploadError(w.uploadFailed); },
  });

  const submit = useMutation({
    mutationFn: (payload: Record<string, unknown>) => (listing
      ? marketApi.patch<{ listing: SellerListing }>(
        `/classifieds/private/listings/${listing.id}`,
        { ...payload, expectedVersion: listing.version },
      )
      : marketApi.post<{ listing: SellerListing }>(
        '/classifieds/private/listings', payload, idempotencyKey,
      )),
    onSuccess: (data) => {
      haptic('success');
      if (!listing) discardDraft();
      onSubmitted((data as { listing: SellerListing }).listing);
    },
    onError: () => haptic('error'),
  });

  function validate(): Record<string, unknown> | null {
    const next: Record<string, string> = {};
    const title = draft.title.trim().replace(/\s+/g, ' ');
    if (title.length < 2) next.title = w.required;
    if (!draft.mediaRefs.length && !listing) next.photos = w.needPhoto;
    const price = Number(draft.priceInput);
    if (!draft.priceInput || !Number.isSafeInteger(price) || price < 0) {
      next.price = w.priceInvalid;
    }
    if (!draft.categoryId) next.category = w.pickCategory;
    if (!draft.condition) next.condition = w.pickCondition;
    if (!draft.districtId) next.district = w.pickDistrict;
    setErrors(next);
    if (Object.keys(next).length) return null;
    const district = locations.find((entry) => entry.districtId === draft.districtId);
    if (!district) { setErrors({ district: w.pickDistrict }); return null; }
    return {
      name: title,
      description: draft.description.trim() || null,
      priceMinor: price,
      currency: 'UZS',
      mediaRefs: draft.mediaRefs,
      globalCategoryId: draft.categoryId,
      condition: draft.condition,
      regionId: district.regionId,
      districtId: district.districtId,
      localityText: draft.locality.trim() || null,
      contactMode: draft.contactMode,
    };
  }

  const onPreview = () => {
    if (validate()) setPreviewOpen(true);
  };
  const onSend = () => {
    const payload = validate();
    if (payload) submit.mutate(payload);
  };

  const districtName = (entry: ClassifiedLocation) =>
    locale === 'ru' ? entry.districtNameRu : entry.districtNameUz;

  return <section className="section stack">
    <div className="row row--between">
      <h1>{listing ? w.edit : w.newListing}</h1>
      <Button variant="ghost" onClick={() => (dirty && !listing ? setLeaveOpen(true) : onCancel())}>
        {w.back}
      </Button>
    </div>

    <Field label={w.photos} hint={w.photosHint} error={errors.photos || uploadError || undefined}>
      <div className="row row--wrap">
        {draft.mediaRefs.map((ref, index) => <span key={ref} className="composer-photo">
          <span className="composer-photo__index" aria-hidden="true">{index + 1}</span>
          <button
            type="button"
            aria-label={`${w.removePhoto} ${index + 1}`}
            onClick={() => setDraft((current) => ({
              ...current,
              mediaRefs: current.mediaRefs.filter((entry) => entry !== ref),
            }))}
          ><Icon name="close" size={16} /></button>
        </span>)}
        {draft.mediaRefs.length < MAX_PHOTOS ? <Button
          type="button"
          variant="secondary"
          pending={upload.isPending}
          onClick={() => fileRef.current?.click()}
        ><Icon name="plus" size={18} />{w.addPhoto}</Button> : null}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (draft.mediaRefs.length >= MAX_PHOTOS) {
            setUploadError(w.tooManyPhotos);
            return;
          }
          upload.mutate(file);
        }}
      />
    </Field>

    <Field label={w.title} hint={w.titleHint} error={errors.title}>
      <input
        value={draft.title}
        onChange={(event) => setDraft((c) => ({
          ...c, title: event.target.value.slice(0, TITLE_MAX),
        }))}
        maxLength={TITLE_MAX}
        enterKeyHint="next"
      />
    </Field>

    <Field label={w.description} hint={w.descriptionHint}>
      <textarea
        value={draft.description}
        onChange={(event) => setDraft((c) => ({
          ...c, description: event.target.value.slice(0, DESCRIPTION_MAX),
        }))}
        rows={4}
        maxLength={DESCRIPTION_MAX}
      />
    </Field>

    <Field label={w.price} hint={w.priceHint} error={errors.price}>
      <input
        value={groupDigits(draft.priceInput)}
        onChange={(event) => setDraft((c) => ({
          ...c, priceInput: digitsOf(event.target.value),
        }))}
        inputMode="numeric"
        enterKeyHint="next"
      />
    </Field>

    <Field label={w.category} error={errors.category}>
      <select
        value={draft.categoryId}
        onChange={(event) => setDraft((c) => ({
          ...c, categoryId: event.target.value, condition: '',
        }))}
      >
        <option value="">{w.pickCategory}</option>
        {categories.map((entry) => <option key={entry.id} value={entry.id}>
          {locale === 'ru' ? entry.nameRu : entry.nameUz}
        </option>)}
      </select>
    </Field>

    <Field label={w.condition} error={errors.condition}>
      <select
        value={draft.condition}
        disabled={!conditions.length}
        onChange={(event) => setDraft((c) => ({ ...c, condition: event.target.value }))}
      >
        <option value="">{w.pickCondition}</option>
        {conditions.map((entry) => <option key={entry} value={entry}>
          {CONDITION_LABELS[entry]?.[locale] ?? entry}
        </option>)}
      </select>
    </Field>

    <Field label={w.district} error={errors.district}>
      <select
        value={draft.districtId}
        onChange={(event) => setDraft((c) => ({ ...c, districtId: event.target.value }))}
      >
        <option value="">{w.pickDistrict}</option>
        {locations.map((entry) => <option key={entry.districtId} value={entry.districtId}>
          {districtName(entry)}
        </option>)}
      </select>
    </Field>

    <Field label={w.locality} hint={w.localityHint}>
      <input
        value={draft.locality}
        onChange={(event) => setDraft((c) => ({
          ...c, locality: event.target.value.slice(0, 120),
        }))}
        maxLength={120}
      />
    </Field>

    <Field label={w.contact} hint={w.contactHint}>
      <select
        value={draft.contactMode}
        onChange={(event) => setDraft((c) => ({
          ...c, contactMode: event.target.value as ContactMode,
        }))}
      >
        <option value="in_app">{w.contactInApp}</option>
        <option value="telegram_relay">{w.contactRelay}</option>
        <option value="phone_optional">{w.contactPhone}</option>
      </select>
    </Field>

    <Button variant="secondary" wide onClick={onPreview}>{w.preview}</Button>
    <Button wide pending={submit.isPending} onClick={onSend}>
      {submit.isPending ? w.submitting : listing ? w.saveChanges : w.submit}
    </Button>
    {submit.isError ? <p className="cabinet-note" role="alert">
      {submit.error instanceof MarketApiError && submit.error.status === 409
        ? w.staleBody
        : w.retry}
    </p> : null}

    <Modal
      open={previewOpen}
      title={w.preview}
      onClose={() => setPreviewOpen(false)}
      closeLabel={w.close}
      sheet
    >
      <div className="stack">
        <p className="muted">{w.previewHint}</p>
        <strong>{draft.title}</strong>
        <strong>{formatPrice(Number(draft.priceInput || 0), locale)}</strong>
        {draft.description ? <p>{draft.description}</p> : null}
        <small>
          {locations.find((entry) => entry.districtId === draft.districtId)
            ? districtName(locations.find((entry) => entry.districtId === draft.districtId)!)
            : ''}
        </small>
        <Button wide pending={submit.isPending} onClick={onSend}>
          {listing ? w.saveChanges : w.submit}
        </Button>
      </div>
    </Modal>

    <ConfirmDialog
      open={recoveryOpen}
      title={w.draftFound}
      body={w.draftRestore}
      confirmLabel={w.draftRestore}
      cancelLabel={w.draftDiscard}
      onConfirm={() => { if (recovered) setDraft(recovered); setRecoveryOpen(false); }}
      onCancel={() => { discardDraft(); setRecoveryOpen(false); }}
    />
    <ConfirmDialog
      open={leaveOpen}
      title={w.leaveTitle}
      body={w.leaveBody}
      confirmLabel={w.leaveConfirm}
      cancelLabel={w.leaveCancel}
      onConfirm={() => { setLeaveOpen(false); onCancel(); }}
      onCancel={() => setLeaveOpen(false)}
    />
  </section>;
}
