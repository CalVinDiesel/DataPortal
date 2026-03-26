window.assetsPath=document.documentElement.getAttribute("data-assets-path"),window.templateName=document.documentElement.getAttribute("data-template"),window.config={colors:{black:window.Helpers.getCssVar("pure-black"),white:window.Helpers.getCssVar("white")}},"undefined"!=typeof TemplateCustomizer&&(window.templateCustomizer=new TemplateCustomizer({displayCustomizer:!1,controls:["color","theme","rtl"]})),window.TemaDataPortal_API_BASE = 'http://localhost:3000';
// ✅ Use our own localStorage key instead of Sneat's Helpers
if (window.Helpers && window.Helpers.setTheme) {
  var _saved = localStorage.getItem('appTheme') || 'light';
  var _resolved = _saved === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : _saved;
  window.Helpers.setTheme(_resolved);
}