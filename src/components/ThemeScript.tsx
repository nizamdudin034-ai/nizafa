// Applies the saved theme (dark/light) and language before first paint,
// so there is no flash of the wrong theme.
export default function ThemeScript() {
  const code = `(function(){try{var t=localStorage.getItem('nizafa-theme');if(t){document.documentElement.setAttribute('data-theme',t)}else if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.setAttribute('data-theme','dark')}var l=localStorage.getItem('nizafa-lang');if(l==='ur'){document.documentElement.setAttribute('lang','ur');document.documentElement.setAttribute('dir','rtl')}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
