import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// PPTB requires IIFE bundles loaded via file:// URLs inside iframes.
// This plugin strips module-related attributes that break in that context.
function pptbHtmlPlugin(): Plugin {
  return {
    name: 'pptb-html-transform',
    // Only rewrite HTML for the production build. In dev, stripping
    // type="module" breaks Vite's client + React Refresh preamble.
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      // Remove module attributes and move scripts to end of body
      let result = html
        .replace(/ type="module"/g, '')
        .replace(/ crossorigin/g, '');
      const scripts: string[] = [];
      result = result.replace(/<script\b[^>]*src="[^"]*"[^>]*><\/script>/g, (match) => {
        scripts.push(match);
        return '';
      });
      if (scripts.length) {
        result = result.replace('</body>', `  ${scripts.join('\n    ')}\n  </body>`);
      }
      return result;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), pptbHtmlPlugin()],
  build: {
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    cssCodeSplit: false,
  },
});
