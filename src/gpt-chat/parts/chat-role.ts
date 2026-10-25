// Lazy part chat-role: the menu's AI role picker. A phone shows it only once
// the menu is open, and the menu button fetches it as it is pressed; a wide
// screen, whose menu is always open, fetches it at once. What the roles tell
// the model (roles.ts) stays on the start bundle: every question is sent with
// one. Their names in the picker (role-labels.ts) come with it here.
// Loaded through lazy-part.tsx only.
export { RoleSelector } from '../components/RoleSelector';
