/**
 * The folder Vite builds scripts and styles into, set in apps/web/vite.config.ts. It must not
 * share a name with a page of the web app: /assets/new is a page, so the folder isn't `assets`.
 */
export const BUILD_DIR = 'static';

/**
 * Whether a request gets the web app's index.html, so every link and refresh opens its page.
 * The API and the build folder are left alone, so a missing file there stays a 404.
 */
export function servesWebApp(path: string) {
  return !new RegExp(`^/(api|${BUILD_DIR})(/|$)`).test(path);
}
