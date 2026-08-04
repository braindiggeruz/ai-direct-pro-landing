import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MarketApiError, classifiedsVoiceSearch, marketApi } from '../lib/api';
import { BOT_CHAT_URL } from '../lib/bot-link';
import { formatPrice } from '../lib/i18n';
import {
  VoiceCaptureError,
  VoiceRecorder,
  voiceCaptureSupported,
  type VoiceRecording,
} from '../lib/voice';
import { useBackStop } from '../platform/navigation';
import { haptic, type ThemePreference } from '../platform/telegram';
import type {
  ClassifiedCategory,
  ClassifiedCondition,
  ClassifiedInquiry,
  ClassifiedListing,
  ClassifiedLocation,
  ClassifiedVoiceSearchResult,
  Locale,
} from '../types';
import {
  VoiceSheet,
  VoiceSummary,
  type VoiceErrorKind,
  type VoiceStage,
} from '../components/VoiceSearch';
import {
  AsyncImage,
  Badge,
  Button,
  ErrorView,
  Field,
  Icon,
  Modal,
  SectionHeader,
  SkeletonList,
  StateView,
  type IconName,
} from '../components/ui';

const ClassifiedsSeller = lazy(() => import('./ClassifiedsSeller')
  .then((module) => ({ default: module.ClassifiedsSeller })));

type View = 'home' | 'search' | 'saved' | 'activity' | 'sell' | 'profile';
type Page<T> = { items: T[]; nextCursor: string | null };

const words = {
  ru: {
    home: 'Главная', search: 'Поиск', saved: 'Сохранённые', activity: 'Запросы',
    title: 'Объявления рядом', body: 'Частные продавцы и магазины Ташкента — без скрытых цен.',
    searchHint: 'Например, велосипед в Юнусабаде', filters: 'Фильтры', all: 'Все',
    category: 'Категория', district: 'Район', condition: 'Состояние', seller: 'Продавец',
    privateSeller: 'Частное лицо', storeSeller: 'Магазин', priceFrom: 'Цена от', priceTo: 'Цена до',
    apply: 'Показать', reset: 'Сбросить', noItems: 'Подходящих объявлений пока нет',
    noItemsBody: 'Измените фильтры или повторите позже.', retry: 'Повторить', details: 'Подробнее',
    save: 'Сохранить', unsave: 'Убрать из сохранённых', location: 'Район',
    verified: 'Личность подтверждена', unverified: 'Новый продавец', contact: 'Написать продавцу',
    contactBody: 'Сообщение останется внутри Bormi. Телефон и Telegram ID не раскрываются.',
    message: 'Ваш вопрос', send: 'Отправить', sent: 'Запрос отправлен',
    sentBody: 'Ответ появится во вкладке «Запросы».', report: 'Пожаловаться',
    reportReason: 'Причина', reportNote: 'Комментарий (необязательно)', reportSent: 'Жалоба принята',
    close: 'Закрыть', savedEmpty: 'Сохранённых объявлений пока нет',
    activityEmpty: 'Вы ещё не писали продавцам', waiting: 'Ждёт ответа', answered: 'Есть ответ', closed: 'Закрыт',
    yourMessage: 'Ваш вопрос', sellerReply: 'Ответ продавца', inquiryOnly: 'Связь через Bormi',
    availability: 'Наличие', available: 'В наличии',
    sell: 'Подать', sellItem: 'Продать', myListings: 'Мои объявления',
    profile: 'Профиль', hello: 'Ваш кабинет',
    profileBody: 'Здесь всё ваше: объявления, обращения и настройки.',
    myListingsHint: 'Черновики, модерация и опубликованные',
    sellerInquiries: 'Обращения покупателей',
    sellerInquiriesHint: 'Вопросы о ваших объявлениях',
    activityTitle: 'Моя активность',
    myActivity: 'Мои запросы',
    myActivityHint: 'Вопросы, которые вы отправили продавцам',
    savedHint: 'Объявления, которые вы отложили',
    settings: 'Настройки', language: 'Язык', theme: 'Оформление',
    themeAuto: 'Как в Telegram', themeLight: 'Светлое', themeDark: 'Тёмное',
    helpTitle: 'Помощь', helpBody: 'Напишите нам в чат Bormi',
    appVersion: 'Версия приложения',
    becomeSeller: 'Подать объявление',
    becomeSellerHint: 'Фото, цена, район — и объявление уходит на модерацию',
  },
  uz: {
    home: 'Bosh sahifa', search: 'Qidirish', saved: 'Saqlanganlar', activity: 'So‘rovlar',
    title: 'Yaqindagi e’lonlar', body: 'Toshkentdagi xususiy sotuvchilar va do‘konlar — yashirin narxlarsiz.',
    searchHint: 'Masalan, Yunusobodda velosiped', filters: 'Filtrlar', all: 'Barchasi',
    category: 'Toifa', district: 'Tuman', condition: 'Holati', seller: 'Sotuvchi',
    privateSeller: 'Jismoniy shaxs', storeSeller: 'Do‘kon', priceFrom: 'Narx, dan', priceTo: 'Narx, gacha',
    apply: 'Ko‘rsatish', reset: 'Tozalash', noItems: 'Mos e’lonlar hozircha yo‘q',
    noItemsBody: 'Filtrlarni o‘zgartiring yoki keyinroq urinib ko‘ring.', retry: 'Qayta urinish', details: 'Batafsil',
    save: 'Saqlash', unsave: 'Saqlanganlardan olish', location: 'Tuman',
    verified: 'Shaxs tasdiqlangan', unverified: 'Yangi sotuvchi', contact: 'Sotuvchiga yozish',
    contactBody: 'Xabar Bormi ichida qoladi. Telefon va Telegram ID oshkor qilinmaydi.',
    message: 'Savolingiz', send: 'Yuborish', sent: 'So‘rov yuborildi',
    sentBody: 'Javob «So‘rovlar» bo‘limida paydo bo‘ladi.', report: 'Shikoyat qilish',
    reportReason: 'Sabab', reportNote: 'Izoh (ixtiyoriy)', reportSent: 'Shikoyat qabul qilindi',
    close: 'Yopish', savedEmpty: 'Saqlangan e’lonlar hozircha yo‘q',
    activityEmpty: 'Siz hali sotuvchilarga yozmagansiz', waiting: 'Javob kutilmoqda', answered: 'Javob bor', closed: 'Yopilgan',
    yourMessage: 'Savolingiz', sellerReply: 'Sotuvchi javobi', inquiryOnly: 'Bormi orqali aloqa',
    availability: 'Mavjudligi', available: 'Mavjud',
    sell: 'Berish', sellItem: 'Sotish', myListings: 'Mening e’lonlarim',
    profile: 'Profil', hello: 'Sizning kabinetingiz',
    profileBody: 'Bu yerda hammasi sizniki: e’lonlar, murojaatlar va sozlamalar.',
    myListingsHint: 'Qoralamalar, moderatsiya va chop etilganlar',
    sellerInquiries: 'Xaridorlar murojaati',
    sellerInquiriesHint: 'E’lonlaringiz haqidagi savollar',
    activityTitle: 'Mening faoliyatim',
    myActivity: 'Mening so‘rovlarim',
    myActivityHint: 'Siz sotuvchilarga yuborgan savollar',
    savedHint: 'Siz saqlab qo‘ygan e’lonlar',
    settings: 'Sozlamalar', language: 'Til', theme: 'Ko‘rinish',
    themeAuto: 'Telegramdagidek', themeLight: 'Yorug‘', themeDark: 'Qorong‘i',
    helpTitle: 'Yordam', helpBody: 'Bormi chatiga yozing',
    appVersion: 'Ilova versiyasi',
    becomeSeller: 'E’lon berish',
    becomeSellerHint: 'Surat, narx, tuman — va e’lon moderatsiyaga ketadi',
  },
} as const;

const conditions: ClassifiedCondition[] = [
  'new', 'like_new', 'good', 'fair', 'for_parts', 'not_applicable',
];
const conditionWords: Record<Locale, Record<ClassifiedCondition, string>> = {
  ru: {
    new: 'Новое', like_new: 'Как новое', good: 'Хорошее', fair: 'Удовлетворительное',
    for_parts: 'На запчасти', not_applicable: 'Не применяется',
  },
  uz: {
    new: 'Yangi', like_new: 'Yangidek', good: 'Yaxshi', fair: 'Qoniqarli',
    for_parts: 'Ehtiyot qismlar uchun', not_applicable: 'Qo‘llanilmaydi',
  },
};
const reportReasons = [
  'misleading_content', 'suspected_fraud', 'prohibited_item', 'unsafe_contact',
  'personal_data', 'duplicate_listing', 'other_policy',
] as const;
const reportReasonWords: Record<Locale, Record<(typeof reportReasons)[number], string>> = {
  ru: {
    misleading_content: 'Вводящее в заблуждение описание', suspected_fraud: 'Подозрение на мошенничество',
    prohibited_item: 'Запрещённый товар', unsafe_contact: 'Небезопасный способ связи',
    personal_data: 'Личные данные в объявлении', duplicate_listing: 'Повторное объявление',
    other_policy: 'Другая причина',
  },
  uz: {
    misleading_content: 'Chalg‘ituvchi tavsif', suspected_fraud: 'Firibgarlikdan shubha',
    prohibited_item: 'Taqiqlangan mahsulot', unsafe_contact: 'Xavfsiz bo‘lmagan aloqa',
    personal_data: 'E’londagi shaxsiy ma’lumotlar', duplicate_listing: 'Takroriy e’lon',
    other_policy: 'Boshqa sabab',
  },
};

function queryString(values: Record<string, string>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  query.set('limit', '20');
  return query.toString();
}

function ListingCard({ item, locale, saved, pending, onOpen, onSave }: {
  item: ClassifiedListing;
  locale: Locale;
  saved: boolean;
  pending: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  const w = words[locale];
  return <article className="product-card classified-card">
    <button className="product-card__visual" onClick={onOpen} aria-label={`${w.details}: ${item.name}`}>
      <AsyncImage className="product-card__media" handle={item.mediaHandles[0]} alt={item.name} />
      <span className="product-card__badge"><Badge>{item.conditionLabel[locale]}</Badge></span>
    </button>
    <div className="product-card__body">
      <span className="product-card__store">{item.location.districtNameRu && locale === 'ru' ? item.location.districtNameRu : item.location.districtNameUz}</span>
      <h3>{item.name}</h3>
      <strong className="product-card__price">{formatPrice(item.priceMinor, locale)}</strong>
      <div className="product-card__actions">
        <Button variant="secondary" onClick={onOpen}>{w.details}</Button>
        <button className="icon-button" disabled={pending} aria-pressed={saved} aria-label={saved ? w.unsave : w.save} onClick={onSave}>
          <Icon name="heart" size={20}/>
        </button>
      </div>
    </div>
  </article>;
}

/**
 * One named destination in the cabinet.
 *
 * The classifieds shell reaches the same screens the store cabinet reached, so
 * it reuses that cabinet's markup rather than inventing a second look for the
 * same idea. `count` is only ever a number the server actually reported, and a
 * zero is not a number worth showing.
 */
function CabinetRow({ icon, title, hint, count, onOpen, href }: {
  icon: IconName;
  title: string;
  hint?: string;
  count?: number;
  onOpen?: () => void;
  href?: string;
}) {
  const body = <>
    <span className="cabinet-row__icon"><Icon name={icon} size={20}/></span>
    <span className="cabinet-row__text">
      <strong>{title}</strong>
      {hint ? <small>{hint}</small> : null}
    </span>
    {count ? <span className="cabinet-row__count">{count}</span> : null}
    <Icon name="chevron" size={18}/>
  </>;
  if (href) {
    return <a className="cabinet-row" href={href} target="_blank" rel="noreferrer">{body}</a>;
  }
  return <button type="button" className="cabinet-row" onClick={onOpen}>{body}</button>;
}

function ChoiceRow<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return <div className="cabinet-choice">
    <span className="cabinet-choice__label" id={`classifieds-choice-${label}`}>{label}</span>
    <div
      className="segmented segmented--choice"
      role="group"
      aria-labelledby={`classifieds-choice-${label}`}
    >
      {options.map((option) => <button
        key={option.value}
        type="button"
        aria-pressed={option.value === value}
        onClick={() => onChange(option.value)}
      >{option.label}</button>)}
    </div>
  </div>;
}

function voiceErrorFor(error: unknown): VoiceErrorKind {
  if (!(error instanceof MarketApiError)) return 'network';
  if (error.code === 'voice_unclear' || error.code === 'validation_failed') return 'unclear';
  if (error.code === 'voice_unavailable' || error.code === 'feature_disabled') return 'unavailable';
  if (error.code === 'rate_limited') return 'rate_limited';
  return 'network';
}

export function ClassifiedsBuyer({
  locale,
  navBack,
  voiceEnabled,
  privateListing,
  userName,
  buildId,
  theme,
  onTheme,
  onLocale,
}: {
  locale: Locale;
  navBack: boolean;
  voiceEnabled: boolean;
  /**
   * Whether this person can sell as well as buy.
   *
   * The server decides. When it is false the publish tab is absent rather than
   * present-and-refusing, because a control that leads to "coming soon" is
   * worse than no control.
   */
  privateListing: boolean;
  /** The person's own first name, shown back to them. Never another user's. */
  userName: string;
  /** The build the server answered from; shown as the app version, nothing else. */
  buildId: string;
  theme: ThemePreference;
  onTheme: (next: ThemePreference) => void;
  onLocale: (next: Locale) => void;
}) {
  const w = words[locale];
  const client = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>('home');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [district, setDistrict] = useState('');
  const [condition, setCondition] = useState('');
  const [sellerType, setSellerType] = useState('');
  const [availability, setAvailability] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<ClassifiedListing | null>(null);
  const [inquiryListing, setInquiryListing] = useState<ClassifiedListing | null>(null);
  const [message, setMessage] = useState('');
  const [reportListing, setReportListing] = useState<ClassifiedListing | null>(null);
  const [reportReason, setReportReason] = useState('misleading_content');
  const [reportNote, setReportNote] = useState('');
  const [voiceStage, setVoiceStage] = useState<VoiceStage>('closed');
  const [voiceError, setVoiceError] = useState<VoiceErrorKind | null>(null);
  const [voiceLevels, setVoiceLevels] = useState<readonly number[]>([]);
  const [voiceElapsed, setVoiceElapsed] = useState(0);
  const [voiceResult, setVoiceResult] = useState<ClassifiedVoiceSearchResult | null>(null);
  const [voiceOffline, setVoiceOffline] = useState(false);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const micAvailable = voiceEnabled && !voiceOffline && voiceCaptureSupported();
  const [sellIntent, setSellIntent] = useState<'listings' | 'composer' | 'inquiries'>('composer');
  // Two screens can be entered from two places — the publish tab and the
  // cabinet — so "back" has to remember which one, rather than always dropping
  // the person on the front page they did not come from.
  const [returnTo, setReturnTo] = useState<View>('home');
  const openSeller = (intent: 'listings' | 'composer' | 'inquiries', from: View) => {
    setSellIntent(intent);
    setReturnTo(from);
    setView('sell');
  };

  /**
   * A tap on the bar.
   *
   * The bar holds roots, so every tab it handles resets the back target: a
   * screen reached by tapping its own tab goes back to the front page, not to
   * wherever the cabinet last pointed.
   *
   * The publish tab is the exception, because it opens a screen rather than a
   * root. Tapping it while that screen is already open must do nothing at all:
   * `setView('sell')` cannot remount the child, which reads `initialView` once,
   * so the composer would not appear — but `setReturnTo` would still land, and
   * the next back press would leave the cabinet the person actually came from
   * for a front page they never chose.
   */
  const openTab = (destination: View) => {
    if (destination === 'sell') {
      if (view !== 'sell') openSeller('composer', view);
      return;
    }
    setReturnTo('home');
    setView(destination);
  };

  // The publish tab exists only when the server granted private listing. A tab
  // that opens "coming soon" is a promise the shell cannot keep.
  //
  // The cabinet tab is always there: it is where a person finds their own
  // listings, their own questions and the settings, and an app whose only
  // account screen is two unlabelled icons in the header is not an app an
  // ordinary person can read.
  const navTabs = ([
    ['home', 'home'],
    ['search', 'search'],
    ...(privateListing ? [['sell', 'plus'] as const] : []),
    ['saved', 'heart'],
    ['profile', 'cabinet'],
  ] as const satisfies readonly (readonly [View, IconName])[]);

  // `saved` is in this set as well as `sell` and `activity`, because all three
  // can be opened from the cabinet as well as from the bar. The bar resets the
  // target to `home` on every tab it handles, so a view reached by tapping its
  // own tab still goes back to the front page rather than to wherever the
  // cabinet last pointed.
  useBackStop(navBack && view !== 'home', `classifieds:${view}`, () => {
    setView(view === 'sell' || view === 'activity' || view === 'saved' ? returnTo : 'home');
  });
  const categories = useQuery<Page<ClassifiedCategory>>({
    queryKey: ['classifieds', 'categories'], queryFn: ({ signal }) => marketApi.get('/classifieds/categories', signal),
  });
  const locations = useQuery<Page<ClassifiedLocation>>({
    queryKey: ['classifieds', 'locations'], queryFn: ({ signal }) => marketApi.get('/classifieds/locations', signal),
  });
  const params = useMemo(() => queryString({
    q: query, categoryId: category, districtId: district, condition, availability,
    sellerType, minPriceMinor: minPrice, maxPriceMinor: maxPrice,
  }), [query, category, district, condition, availability, sellerType, minPrice, maxPrice]);
  const listings = useQuery<Page<ClassifiedListing>>({
    queryKey: ['classifieds', 'listings', params],
    queryFn: ({ signal }) => marketApi.get(`/classifieds/listings?${params}`, signal),
  });
  const favorites = useQuery<Page<ClassifiedListing>>({
    queryKey: ['classifieds', 'favorites'], queryFn: ({ signal }) => marketApi.get('/classifieds/favorites', signal),
  });
  const inquiries = useQuery<Page<ClassifiedInquiry>>({
    queryKey: ['classifieds', 'inquiries'], queryFn: ({ signal }) => marketApi.get('/classifieds/inquiries', signal),
  });
  const savedIds = useMemo(() => new Set((favorites.data?.items ?? []).map((item) => item.id)), [favorites.data]);
  // Only questions still waiting on a seller are worth a number in the cabinet.
  const openInquiryCount = useMemo(
    () => (inquiries.data?.items ?? []).filter((item) => item.status === 'open').length,
    [inquiries.data],
  );
  const favorite = useMutation({
    mutationFn: ({ id, saved }: { id: string; saved: boolean }) => saved
      ? marketApi.delete(`/classifieds/listings/${encodeURIComponent(id)}/favorite`)
      : marketApi.post(`/classifieds/listings/${encodeURIComponent(id)}/favorite`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['classifieds', 'favorites'] }),
  });
  const inquiry = useMutation({
    mutationFn: () => marketApi.post<{ inquiry: ClassifiedInquiry }>(
      `/classifieds/listings/${encodeURIComponent(inquiryListing!.id)}/inquiries`, { message: message.trim() },
    ),
    onSuccess: () => {
      setMessage(''); setInquiryListing(null); setReturnTo('home'); setView('activity');
      void client.invalidateQueries({ queryKey: ['classifieds', 'inquiries'] });
    },
  });
  const report = useMutation({
    mutationFn: () => marketApi.post(
      `/classifieds/listings/${encodeURIComponent(reportListing!.id)}/reports`,
      { reason: reportReason, ...(reportNote.trim() ? { note: reportNote.trim() } : {}) },
    ),
    onSuccess: () => { setReportNote(''); setReportListing(null); },
  });
  const voice = useMutation<ClassifiedVoiceSearchResult, Error, VoiceRecording>({
    mutationFn: (recording) => classifiedsVoiceSearch(recording),
    onSuccess: (result) => {
      haptic('success');
      setVoiceStage('closed');
      setVoiceResult(result);
      const nextQuery = result.interpretation.productQuery;
      const nextCategory = result.interpretation.category?.id ?? '';
      const nextAvailability = result.interpretation.availability ?? '';
      const nextMaxPrice = result.interpretation.maxPriceMinor === null
        ? ''
        : String(result.interpretation.maxPriceMinor);
      setInput(nextQuery);
      setQuery(nextQuery);
      setCategory(nextCategory);
      setDistrict('');
      setCondition('');
      setSellerType('');
      setAvailability(nextAvailability);
      setMinPrice('');
      setMaxPrice(nextMaxPrice);
      setView('search');
      const nextParams = queryString({
        q: nextQuery,
        categoryId: nextCategory,
        districtId: '',
        condition: '',
        sellerType: '',
        availability: nextAvailability,
        minPriceMinor: '',
        maxPriceMinor: nextMaxPrice,
      });
      client.setQueryData(['classifieds', 'listings', nextParams], {
        items: result.items,
        nextCursor: result.nextCursor,
      });
    },
    onError: (error) => {
      const kind = voiceErrorFor(error);
      if (kind === 'unavailable') setVoiceOffline(true);
      haptic('error');
      setVoiceError(kind);
      setVoiceStage('error');
    },
  });
  const releaseRecorder = () => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
  };
  useEffect(() => releaseRecorder, []);
  const failVoice = (kind: VoiceErrorKind) => {
    haptic('error');
    setVoiceError(kind);
    setVoiceStage('error');
  };
  const finishRecording = async () => {
    const recorder = recorderRef.current;
    if (!recorder?.recording) return;
    setVoiceStage('processing');
    try {
      const recording = await recorder.stop();
      recorderRef.current = null;
      haptic('tap');
      voice.mutate(recording);
    } catch (error) {
      recorderRef.current = null;
      failVoice(
        error instanceof VoiceCaptureError && error.reason === 'too_short'
          ? 'too_short'
          : 'unclear',
      );
    }
  };
  const beginRecording = async () => {
    releaseRecorder();
    setVoiceError(null);
    setVoiceLevels([]);
    setVoiceElapsed(0);
    setVoiceStage('requesting');
    const recorder = new VoiceRecorder({
      onLevels: (levels) => setVoiceLevels(levels.slice()),
      onElapsed: setVoiceElapsed,
      onAutoStop: () => void finishRecording(),
    });
    recorderRef.current = recorder;
    try {
      await recorder.start();
      haptic('tap');
      setVoiceStage('recording');
    } catch (error) {
      recorderRef.current = null;
      const reason = error instanceof VoiceCaptureError ? error.reason : 'capture_failed';
      failVoice(
        reason === 'permission_denied' || reason === 'no_microphone'
          ? 'denied'
          : reason === 'unsupported'
            ? 'unsupported'
            : 'network',
      );
    }
  };
  const openVoice = () => {
    if (!micAvailable) return;
    setVoiceError(null);
    setVoiceLevels([]);
    setVoiceElapsed(0);
    setView('search');
    setVoiceStage('intro');
  };
  const closeVoice = () => {
    releaseRecorder();
    setVoiceStage('closed');
  };
  const typeInstead = () => {
    closeVoice();
    requestAnimationFrame(() => searchRef.current?.focus());
  };
  const submitSearch = (event: FormEvent) => { event.preventDefault(); setQuery(input.trim()); setView('search'); };
  const reset = () => { setCategory(''); setDistrict(''); setCondition(''); setSellerType(''); setAvailability(''); setMinPrice(''); setMaxPrice(''); };
  const list = view === 'saved' ? favorites : listings;

  return <>
    <main id="main-content" className="page classifieds-page">
      {view === 'home' ? <>
        <section className="hero hero--brand"><p className="eyebrow"><Icon name="spark" size={15}/>{w.title}</p><h1>{w.title}</h1><p>{w.body}</p></section>
        <form className="search-form" role="search" onSubmit={submitSearch}>
          <div className="search-field"><Icon name="search" size={20}/><input ref={searchRef} value={input} onChange={(event) => setInput(event.target.value)} type="search" enterKeyHint="search" aria-label={w.search} placeholder={w.searchHint}/>{micAvailable ? <button type="button" className="search-field__mic" aria-label={locale === 'ru' ? 'Сказать голосом' : 'Ovoz bilan ayting'} onClick={openVoice}><Icon name="mic" size={20}/></button> : null}</div>
          <Button type="submit" aria-label={w.search}><Icon name="chevron"/></Button>
        </form>
        <div className="chip-row" role="group" aria-label={w.category}>{categories.data?.items.map((item) => <button key={item.id} className="chip" onClick={() => { setCategory(item.id); setView('search'); }}><span>{locale === 'ru' ? item.nameRu : item.nameUz}</span><small>{item.visibleListingCount}</small></button>)}</div>
      </> : null}

      {view === 'search' || view === 'home' ? <section className="section">
        {view === 'search' ? <><div className="row row--between"><h1>{w.search}</h1><Button variant="secondary" onClick={() => setFiltersOpen(true)}><Icon name="filter" size={18}/>{w.filters}</Button></div><form className="search-form" role="search" onSubmit={submitSearch}><div className="search-field"><Icon name="search" size={20}/><input ref={searchRef} value={input} onChange={(event) => setInput(event.target.value)} type="search" enterKeyHint="search" aria-label={w.search} placeholder={w.searchHint}/>{micAvailable ? <button type="button" className="search-field__mic" aria-label={locale === 'ru' ? 'Сказать голосом' : 'Ovoz bilan ayting'} onClick={openVoice}><Icon name="mic" size={20}/></button> : null}</div><Button type="submit"><Icon name="chevron"/></Button></form>{voiceResult ? <VoiceSummary key={voiceResult.transcript} locale={locale} transcript={voiceResult.transcript} interpretation={voiceResult.interpretation} activeMaxPrice={maxPrice ? Number(maxPrice) : null} activeAvailability={availability} onSubmitTranscript={(value) => { setInput(value); setQuery(value); setCategory(''); setAvailability(''); setMaxPrice(''); setVoiceResult(null); }} onClearBudget={() => setMaxPrice('')} onClearAvailability={() => setAvailability('')} onConfirmBudget={(accepted) => setMaxPrice(accepted && voiceResult.interpretation.ambiguousPriceMinor !== null ? String(voiceResult.interpretation.ambiguousPriceMinor) : '')} onDismiss={() => setVoiceResult(null)}/> : null}</> : null}
        {list.isLoading
          ? <SkeletonList/>
          : list.isError
            ? <ErrorView locale={locale} retry={() => void list.refetch()}/>
            : list.data?.items.length
              ? <div className="product-grid">{list.data.items.map((item) => <ListingCard key={item.id} item={item} locale={locale} saved={savedIds.has(item.id)} pending={favorite.isPending && favorite.variables?.id === item.id} onOpen={() => setSelected(item)} onSave={() => favorite.mutate({ id: item.id, saved: savedIds.has(item.id) })}/>)}</div>
              : <StateView icon="search" title={w.noItems} body={w.noItemsBody}/>}
      </section> : null}

      {view === 'saved' ? <section className="section"><h1>{w.saved}</h1>{favorites.isLoading ? <SkeletonList/> : favorites.isError ? <ErrorView locale={locale} retry={() => void favorites.refetch()}/> : favorites.data?.items.length ? <div className="product-grid">{favorites.data.items.map((item) => <ListingCard key={item.id} item={item} locale={locale} saved pending={favorite.isPending && favorite.variables?.id === item.id} onOpen={() => setSelected(item)} onSave={() => favorite.mutate({ id: item.id, saved: true })}/>)}</div> : <StateView icon="heart" title={w.savedEmpty}/>}</section> : null}

      {view === 'activity' ? <section className="section"><h1>{w.activity}</h1>{inquiries.isLoading ? <SkeletonList/> : inquiries.isError ? <ErrorView locale={locale} retry={() => void inquiries.refetch()}/> : inquiries.data?.items.length ? <div className="stack">{inquiries.data.items.map((item) => <article className="card" key={item.id}><div className="card__body stack"><div className="row row--between"><strong>{item.listing.name}</strong><Badge tone={item.status === 'answered' ? 'positive' : 'info'}>{item.status === 'answered' ? w.answered : item.status === 'open' ? w.waiting : w.closed}</Badge></div><small>{w.yourMessage}</small><p>{item.message}</p>{item.reply ? <><small>{w.sellerReply}</small><p>{item.reply}</p></> : null}</div></article>)}</div> : <StateView icon="help" title={w.activityEmpty}/>}</section> : null}
      {/* The seller half of the app. Lazily loaded, so a buyer who never sells
          does not download the composer, and mounted with the taxonomy the
          buyer screen already fetched rather than fetching it a second time. */}
      {view === 'sell' ? <section className="section">
        <Suspense fallback={<SkeletonList count={2}/>}>
          <ClassifiedsSeller
            locale={locale}
            categories={categories.data?.items ?? []}
            locations={locations.data?.items ?? []}
            initialView={sellIntent}
            onClose={() => setView(returnTo)}
          />
        </Suspense>
      </section> : null}

      {/* The cabinet. Everything that belongs to the person rather than to the
          catalogue, in one place they can reach from the bar without being
          told where to look. */}
      {view === 'profile' ? <>
        <section className="hero">
          <p className="eyebrow"><Icon name="cabinet" size={15}/>{userName}</p>
          <h1>{w.hello}</h1>
          <p>{w.profileBody}</p>
        </section>

        {privateListing ? <section className="section">
          <SectionHeader title={w.sellItem}/>
          <div className="cabinet-list">
            <CabinetRow
              icon="plus"
              title={w.becomeSeller}
              hint={w.becomeSellerHint}
              onOpen={() => openSeller('composer', 'profile')}
            />
            <CabinetRow
              icon="products"
              title={w.myListings}
              hint={w.myListingsHint}
              onOpen={() => openSeller('listings', 'profile')}
            />
            <CabinetRow
              icon="help"
              title={w.sellerInquiries}
              hint={w.sellerInquiriesHint}
              onOpen={() => openSeller('inquiries', 'profile')}
            />
          </div>
        </section> : null}

        <section className="section">
          <SectionHeader title={w.activityTitle}/>
          <div className="cabinet-list">
            <CabinetRow
              icon="help"
              title={w.myActivity}
              hint={w.myActivityHint}
              count={openInquiryCount}
              onOpen={() => { setReturnTo('profile'); setView('activity'); }}
            />
            <CabinetRow
              icon="heart"
              title={w.saved}
              hint={w.savedHint}
              count={savedIds.size}
              onOpen={() => { setReturnTo('profile'); setView('saved'); }}
            />
          </div>
        </section>

        <section className="section">
          <SectionHeader title={w.settings}/>
          <div className="cabinet-list">
            <ChoiceRow
              label={w.language}
              value={locale}
              options={[
                { value: 'ru' as Locale, label: 'Русский' },
                { value: 'uz' as Locale, label: 'O‘zbekcha' },
              ]}
              onChange={onLocale}
            />
            <ChoiceRow
              label={w.theme}
              value={theme}
              options={[
                { value: 'auto' as ThemePreference, label: w.themeAuto },
                { value: 'light' as ThemePreference, label: w.themeLight },
                { value: 'dark' as ThemePreference, label: w.themeDark },
              ]}
              onChange={onTheme}
            />
          </div>
        </section>

        <section className="section">
          <SectionHeader title={w.helpTitle}/>
          <div className="cabinet-list">
            {BOT_CHAT_URL ? <CabinetRow
              icon="help"
              title={w.helpTitle}
              hint={w.helpBody}
              href={BOT_CHAT_URL}
            /> : null}
            <div className="cabinet-choice">
              <span className="cabinet-choice__label">{w.appVersion}</span>
              <p className="cabinet-note">{buildId}</p>
            </div>
          </div>
        </section>
      </> : null}
    </main>

    <nav className="bottom-nav bottom-nav--auto" aria-label="Bormi classifieds">
      {navTabs.map(([destination, icon]) => <button key={destination} onClick={() => openTab(destination)} aria-current={view === destination ? 'page' : undefined}><span className="bottom-nav__icon"><Icon name={icon}/></span><span>{w[destination]}</span></button>)}
    </nav>

    <Modal open={Boolean(selected)} title={selected?.name ?? ''} onClose={() => setSelected(null)} closeLabel={w.close} sheet>
      {selected ? <div className="stack classified-detail"><AsyncImage className="classified-detail__media" handle={selected.mediaHandles[0]} alt={selected.name}/><div className="row row--between"><strong className="price-large">{formatPrice(selected.priceMinor, locale)}</strong><Badge>{selected.conditionLabel[locale]}</Badge></div>{selected.description ? <p>{selected.description}</p> : null}<dl className="spec-list"><div><dt>{w.location}</dt><dd>{locale === 'ru' ? selected.location.districtNameRu : selected.location.districtNameUz}</dd></div><div><dt>{w.seller}</dt><dd>{selected.seller.displayName}</dd></div></dl><div className="notice"><Icon name="check" size={18}/><span>{selected.seller.verificationState === 'unverified' ? w.unverified : w.verified}. {w.inquiryOnly}.</span></div><Button wide onClick={() => { setInquiryListing(selected); setSelected(null); }}>{w.contact}</Button><Button wide variant="ghost" onClick={() => { setReportListing(selected); setSelected(null); }}>{w.report}</Button></div> : null}
    </Modal>

    <Modal open={Boolean(inquiryListing)} title={w.contact} onClose={() => setInquiryListing(null)} closeLabel={w.close} sheet><form className="stack" onSubmit={(event) => { event.preventDefault(); if (message.trim().length >= 2) inquiry.mutate(); }}><p>{w.contactBody}</p><Field label={w.message}><textarea required minLength={2} maxLength={500} rows={5} value={message} onChange={(event) => setMessage(event.target.value)}/></Field>{inquiry.isError ? <p className="form-error" role="alert">{w.retry}</p> : null}<Button wide type="submit" pending={inquiry.isPending}>{w.send}</Button></form></Modal>

    <Modal open={Boolean(reportListing)} title={w.report} onClose={() => setReportListing(null)} closeLabel={w.close} sheet><form className="stack" onSubmit={(event) => { event.preventDefault(); report.mutate(); }}><Field label={w.reportReason}><select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>{reportReasons.map((reason) => <option key={reason} value={reason}>{reportReasonWords[locale][reason]}</option>)}</select></Field><Field label={w.reportNote}><textarea maxLength={500} rows={4} value={reportNote} onChange={(event) => setReportNote(event.target.value)}/></Field>{report.isSuccess ? <p role="status">{w.reportSent}</p> : null}{report.isError ? <p className="form-error" role="alert">{w.retry}</p> : null}<Button wide type="submit" pending={report.isPending}>{w.send}</Button></form></Modal>

    <Modal open={filtersOpen} title={w.filters} onClose={() => setFiltersOpen(false)} closeLabel={w.close} sheet><div className="stack"><Field label={w.category}><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">{w.all}</option>{categories.data?.items.map((item) => <option key={item.id} value={item.id}>{locale === 'ru' ? item.nameRu : item.nameUz}</option>)}</select></Field><Field label={w.district}><select value={district} onChange={(event) => setDistrict(event.target.value)}><option value="">{w.all}</option>{locations.data?.items.map((item) => <option key={item.districtId} value={item.districtId}>{locale === 'ru' ? item.districtNameRu : item.districtNameUz}</option>)}</select></Field><Field label={w.condition}><select value={condition} onChange={(event) => setCondition(event.target.value)}><option value="">{w.all}</option>{conditions.map((item) => <option key={item} value={item}>{conditionWords[locale][item]}</option>)}</select></Field><Field label={w.availability}><select value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="">{w.all}</option><option value="available">{w.available}</option></select></Field><Field label={w.seller}><select value={sellerType} onChange={(event) => setSellerType(event.target.value)}><option value="">{w.all}</option><option value="private">{w.privateSeller}</option><option value="store">{w.storeSeller}</option></select></Field><div className="classified-price-grid"><Field label={w.priceFrom}><input type="number" inputMode="numeric" min={0} value={minPrice} onChange={(event) => setMinPrice(event.target.value)}/></Field><Field label={w.priceTo}><input type="number" inputMode="numeric" min={0} value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)}/></Field></div><Button wide onClick={() => setFiltersOpen(false)}>{w.apply}</Button><Button wide variant="secondary" onClick={reset}>{w.reset}</Button></div></Modal>

    <VoiceSheet locale={locale} stage={voiceStage} error={voiceError} levels={voiceLevels} elapsedMs={voiceElapsed} onAllow={() => void beginRecording()} onStop={() => void finishRecording()} onCancel={closeVoice} onRetry={() => void beginRecording()} onTypeInstead={typeInstead}/>
  </>;
}
