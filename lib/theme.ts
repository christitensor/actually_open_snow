// Shared useSyncExternalStore plumbing for reading the <html> dark-mode
// class from client components (ThemeToggle, SkiMap) without tripping the
// "no setState in effect" lint rule — MutationObserver + effect + setState
// was the natural approach but React's hooks lint now flags that pattern.
export function subscribeToTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

export function getIsDarkSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function getIsDarkServerSnapshot(): boolean {
  return false;
}
