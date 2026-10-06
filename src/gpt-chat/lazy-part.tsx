// The chat's lazy parts (plan WP-10): screens most visitors never open load
// when first needed, so the start bundle carries only what answers a question.
// Each part is one import() of a module in ./parts, which names its chunk
// (chat-account, chat-answer, chat-lead, chat-tools, chat-turnstile); scripts/chat-bundle-budget.ts holds
// each to its budget and fails if one is ever pulled back into the start.
import { Component, lazy, Suspense, useState, type ComponentType, type ReactNode } from 'react';

type View<M> = ComponentType<{ render: (module: M) => ReactNode }>;

export interface Part<M> {
  /** The module; one request however often it is asked for. */
  load: () => Promise<M>;
  /** Fetch it now, before anyone opens it; a failure is not kept. */
  preload: () => void;
  /**
   * What renders the module: once it is here, a plain component, so a screen
   * opened after a preload shows no frame of its placeholder; before that, one
   * React.lazy per page.
   */
  view: () => View<M>;
}

export function part<M>(importer: () => Promise<M>): Part<M> {
  const viewOf = (module: M): View<M> => ({ render }) => render(module);
  let pending: Promise<M> | null = null;
  let ready: View<M> | null = null;
  let suspended: View<M> | null = null;
  // A failed request is forgotten, and so is the lazy that saw it fail (a
  // rejected lazy stays rejected): the next opening asks again. Chromium keeps
  // a failed module fetch for the life of the page, so there the answer is
  // the same until a reload (PartFailed).
  const load = () => (pending ??= importer().then((module) => {
    ready = viewOf(module);
    return module;
  }, (error: unknown) => {
    pending = null;
    throw error;
  }));
  return {
    load,
    preload: () => void load().catch(() => undefined),
    view: () => ready ?? (suspended ??= lazy(() => load().then((module) => ({ default: viewOf(module) }), (error: unknown) => {
      suspended = null;
      throw error;
    }))),
  };
}

export const accountPart = part(() => import('./parts/chat-account'));
export const answerPart = part(() => import('./parts/chat-answer'));
export const leadPart = part(() => import('./parts/chat-lead'));
export const toolsPart = part(() => import('./parts/chat-tools'));
export const turnstilePart = part(() => import('./parts/chat-turnstile'));

class PartBoundary extends Component<{ failed: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.failed : this.props.children;
  }
}

/**
 * Renders `children` with the part's module once it is here, `fallback` while
 * it loads and `failed` if it cannot load (offline, or a release replaced its
 * file) or breaks: the chat around it keeps working either way.
 */
export function LazyPart<M>({ part: source, fallback, failed, children }: {
  part: Part<M>;
  fallback: ReactNode;
  failed: ReactNode;
  children: (module: M) => ReactNode;
}) {
  // Chosen once per mount: the tree keeps its shape (and the screen its state)
  // when a part that was loading arrives.
  const [View] = useState(source.view);
  return (
    <PartBoundary failed={failed}>
      <Suspense fallback={fallback}>
        <View render={children} />
      </Suspense>
    </PartBoundary>
  );
}

/** Holds a part's place while it loads, at its usual height; said once to a screen reader. */
export function PartLoading({ label, className = '' }: { label: string; className?: string }) {
  return <div className={`gpt-part-loading ${className}`.trim()} role="status" aria-label={label} />;
}

/**
 * A part that did not arrive. Trying the same import again is no use: a
 * browser keeps the failed module, and after a release the file is gone. A
 * reload brings the page and its parts back, and the stored conversation with it.
 */
export function PartFailed({ message, reload }: { message: string; reload: string }) {
  return (
    <div role="alert" className="gpt-error">
      <p>{message}</p>
      <button type="button" className="gpt-text-button" onClick={() => window.location.reload()}>{reload}</button>
    </div>
  );
}
