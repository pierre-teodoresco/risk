// Run before paint; the same key and resolution rules as the client store, with no user input.
export const THEME_KEY = "tablee.theme";
export const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
export const THEME_INIT = `(function(){var p='system';try{var s=localStorage.getItem('${THEME_KEY}');if(s==='light'||s==='dark')p=s}catch(e){}var d=document.documentElement;d.dataset.themePreference=p;d.dataset.theme=p==='system'?(matchMedia('${SYSTEM_THEME_QUERY}').matches?'dark':'light'):p})()`;
