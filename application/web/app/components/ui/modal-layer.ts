// Notifications must remain visible and operable inside the current native modal.
const modals: HTMLDialogElement[] = [];
const listeners = new Set<() => void>();
export const getTopModal = () => modals.at(-1) ?? null;
export const getServerModal = () => null;
export const subscribeToModals = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function registerModal(dialog: HTMLDialogElement) {
  modals.push(dialog);
  listeners.forEach((listener) => listener());
  return () => {
    const index = modals.indexOf(dialog);
    if (index !== -1) modals.splice(index, 1);
    listeners.forEach((listener) => listener());
  };
}
