import type { ChatMessage } from './types';

/** A local artifact reference, never an instruction or a paid entitlement. */
export function isPresentationMessage(message: ChatMessage): boolean {
  return message.kind === 'presentation' && typeof message.artifactId === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(message.artifactId);
}

/** Explicit creation requests only. Questions about presentations remain text. */
export function wantsPresentation(text: string): boolean {
  const request = text.trim().slice(0, 500);
  if (/\?|^(?:как|что|не\s|nima|qanday)/iu.test(request)) return false;
  return /^(?:пожалуйста[,\s]+)?(?:создай|сделай|подготовь)\s+.{0,100}презентац|(?:taqdimot|prezentatsiya).{0,100}(?:yarat|tayyorla)(?:ib|b)?(?:\s|$)|^(?:yarat|tayyorla).{0,100}(?:taqdimot|prezentatsiya)/iu.test(request);
}
