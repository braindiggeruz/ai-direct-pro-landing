import { createRoot } from 'react-dom/client';
import { Form } from '../../apps/studio/src/tools/presentation/Form';
import DocumentExport from '../../apps/studio/src/tools/presentation/DocumentExport';
import Documents from '../../src/admin/pages/Documents';
import '../../src/index.css';
import '../../apps/studio/src/styles.css';

const query = new URLSearchParams(location.search);
const locale = query.get('locale') === 'uz' ? 'uz' : 'ru';
const deck = { title: 'Document fixture', subtitle: 'Cover subtitle', slides: [{ index: 1, title: 'Body title', bullets: ['Owner supplied fact'], notes: 'Speaker notes', layout: 'title-bullets' as const }] };
createRoot(document.getElementById('root')!).render(query.get('mode') === 'admin' ? <Documents /> : <main style={{ maxWidth: 720, margin: 'auto', padding: 16 }}>{query.get('mode') === 'export' ? <DocumentExport deck={deck} locale={locale} /> : <Form locale={locale} />}</main>);
