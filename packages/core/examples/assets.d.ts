/** The bundler (Bun, or Vite on the docs site) turns an imported SVG into its URL. */
declare module "*.svg" {
  const url: string;
  export default url;
}
