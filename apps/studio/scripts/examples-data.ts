import type { Deck, StudioLocale } from '../src/api';

/** Curated public examples, not customer work or a claim about a live generation. */
export interface PresentationExampleSource {
  readonly id: string;
  readonly locale: StudioLocale;
  readonly palette: number;
  readonly deck: Deck;
}

export const PRESENTATION_EXAMPLES: readonly PresentationExampleSource[] = [
  {
    id: 'uz-oquv-reja-v1', locale: 'uz', palette: 1,
    deck: {
      title: 'Haftalik o‘quv reja',
      subtitle: 'Maqsad → mashq → tekshiruv',
      slides: [
        { index: 1, layout: 'title-bullets', title: 'Bitta aniq maqsaddan boshlang', bullets: [
          'Bu hafta o‘rganadigan bitta mavzuni tanlang.',
          'Natijani tekshirish usulini oldindan belgilang.',
          'Masalan: beshta masalani izoh bilan yechish.',
        ] },
        { index: 2, layout: 'title-bullets', title: 'Vaqtni kichik qismlarga ajrating', bullets: [
          'Dushanba: mavzuni o‘qing va savollar yozing.',
          'Seshanba: birinchi mashqlarni bajaring.',
          'Chorshanba: qiyin joylarni qayta ko‘rib chiqing.',
          'Juma: natijani tekshiring va xulosa yozing.',
        ] },
        { index: 3, layout: 'title-bullets', title: 'Faol mashq qiling', bullets: [
          'Qoidani o‘z so‘zlaringiz bilan tushuntiring.',
          'Misolni avval mustaqil bajarib ko‘ring.',
          'Keyin yechim bilan solishtiring.',
          'Xatoni belgilang va sababini yozing.',
        ] },
        { index: 4, layout: 'title-bullets', title: 'Rejani natijaga qarab yangilang', bullets: [
          'Nimani yordamsiz bajara oldingiz?',
          'Qaysi savol hali tushunarsiz?',
          'Keyingi haftada nimani takrorlaysiz?',
        ] },
      ],
    },
  },
  {
    id: 'ru-korotkoe-vystuplenie-v1', locale: 'ru', palette: 1,
    deck: {
      title: 'Короткое выступление',
      subtitle: 'Одна мысль · понятный пример · следующий шаг',
      slides: [
        { index: 1, layout: 'title-bullets', title: 'Определите главную мысль', bullets: [
          'Что слушатель должен понять после выступления?',
          'Сформулируйте ответ одним предложением.',
          'Уберите детали, которые не помогают этой мысли.',
        ] },
        { index: 2, layout: 'title-bullets', title: 'Постройте простой рассказ', bullets: [
          'Задача: что требуется решить.',
          'Подход: какие действия вы предлагаете.',
          'Пример: как это выглядит на практике.',
          'Вывод: с чего можно начать.',
        ] },
        { index: 3, layout: 'title-bullets', title: 'Подготовьте слайды к чтению', bullets: [
          'Один слайд — одна основная мысль.',
          'Заголовок сразу сообщает содержание.',
          'Короткие пункты поддерживают рассказ.',
          'Числа и факты имеют проверяемый источник.',
        ] },
        { index: 4, layout: 'title-bullets', title: 'Проверьте перед выступлением', bullets: [
          'Откройте файл на нужном устройстве.',
          'Прочитайте заголовки и текст вслух.',
          'Проверьте время и завершите понятным выводом.',
        ] },
      ],
    },
  },
];
