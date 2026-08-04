import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MarketApiError, classifiedsVoiceSearch, marketApi } from '../lib/api';
import { formatPrice } from '../lib/i18n';
import {
  VoiceCaptureError,
  VoiceRecorder,
  voiceCaptureSupported,
  type VoiceRecording,
} from '../lib/voice';
import { useBackStop } from '../platform/navigation';
import { haptic } from '../platform/telegram';
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
  SkeletonList,
  StateView,
} from '../components/ui';

type View = 'home' | 'search' | 'saved' | 'activity';
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

function voiceErrorFor(error: unknown): VoiceErrorKind {
  if (!(error instanceof MarketApiError)) return 'network';
  if (error.code === 'voice_unclear' || error.code === 'validation_failed') return 'unclear';
  if (error.code === 'voice_unavailable' || error.code === 'feature_disabled') return 'unavailable';
  if (error.code === 'rate_limited') return 'rate_limited';
  return 'network';
}

export function ClassifiedsBuyer({ locale, navBack, voiceEnabled }: {
  locale: Locale;
  navBack: boolean;
  voiceEnabled: boolean;
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

  useBackStop(navBack && view !== 'home', `classifieds:${view}`, () => setView('home'));
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
      setMessage(''); setInquiryListing(null); setView('activity');
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
    </main>

    <nav className="bottom-nav" aria-label="Bormi classifieds">
      {([['home', 'home'], ['search', 'search'], ['saved', 'heart'], ['activity', 'help']] as const).map(([destination, icon]) => <button key={destination} onClick={() => setView(destination)} aria-current={view === destination ? 'page' : undefined}><span className="bottom-nav__icon"><Icon name={icon}/></span><span>{w[destination]}</span></button>)}
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
