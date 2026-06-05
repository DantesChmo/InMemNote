const TW_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "cozy",
  "sidebar": true,
  "accent": "#3f7d6b"
}/*EDITMODE-END*/;

function Tw(){
  const [t, setTweak] = useTweaks(TW_DEFAULTS);
  React.useEffect(() => {
    const r = document.documentElement;
    r.setAttribute('data-theme', t.theme);
    r.style.setProperty('--accent', t.accent);
  }, [t.theme, t.accent]);
  React.useEffect(() => { if(window.__setDensity) window.__setDensity(t.density); }, [t.density]);
  React.useEffect(() => { if(window.__toggleSidebar) window.__toggleSidebar(t.sidebar); }, [t.sidebar]);
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Окно" />
      <TweakRadio label="Тема" value={t.theme} options={['dark','light']} onChange={(v)=>setTweak('theme',v)} />
      <TweakToggle label="Сайдбар" value={t.sidebar} onChange={(v)=>setTweak('sidebar',v)} />
      <TweakRadio label="Плотность списка" value={t.density} options={['cozy','compact']} onChange={(v)=>setTweak('density',v)} />
      <TweakSection label="Бренд" />
      <TweakColor label="Акцент" value={t.accent}
        options={['#3f7d6b','#c2603a','#d98a3d','#5a6b8c']} onChange={(v)=>setTweak('accent',v)} />
    </TweaksPanel>
  );
}
ReactDOM.createRoot(document.getElementById('tweaks-root')).render(<Tw />);
