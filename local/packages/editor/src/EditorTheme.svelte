<!-- Shared palette for workspace and standalone editors. Preview documents keep their own colors. -->
<style>
 :global(.editor-theme){
  --w-bg:rgb(var(--color-background,243,244,246));
  --w-panel:rgb(var(--color-background-400,255,255,255));
  --w-text:rgb(var(--color-primary,31,41,55));
  --w-muted:color-mix(in srgb,var(--w-text) 75%,var(--w-panel));
  --w-border:rgb(var(--color-secondary-300,209,213,219));
  --w-brand:rgb(var(--color-brand,37,99,235));
  --w-hover:color-mix(in srgb,var(--w-text) 10%,var(--w-panel));
  --w-disabled:color-mix(in srgb,var(--w-text) 6%,var(--w-panel));
  --w-success:#166534;--w-danger:#b91c1c;--w-warning:#92400e;--w-info:#1e40af;
  --w-success-bg:color-mix(in srgb,var(--w-success) 12%,var(--w-panel));
  --w-danger-bg:color-mix(in srgb,var(--w-danger) 12%,var(--w-panel));
  --w-warning-bg:color-mix(in srgb,var(--w-warning) 12%,var(--w-panel));
  /* Page configuration and value editors are shared with the Flow editor. */
  --f-bg:var(--w-bg);--f-panel:var(--w-panel);--f-text:var(--w-text);
  --f-muted:var(--w-muted);--f-border:var(--w-border);--f-brand:var(--w-brand);
  --f-success:var(--w-success);--f-danger:var(--w-danger);--f-warning:var(--w-warning);
  color-scheme:light;color:var(--w-text);background:var(--w-bg);
 }
 :global(.editor-theme.dark){color-scheme:dark;--w-success:#86efac;--w-danger:#fca5a5;--w-warning:#fcd34d;--w-info:#93c5fd}
 :global(.editor-theme :where(input,select,textarea,button)){font:inherit;accent-color:var(--w-brand)}
 :global(.editor-theme :where(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),select,textarea)){
  color:var(--w-text);background:var(--w-panel);border:1px solid var(--w-border);border-radius:4px;
 }
 :global(.editor-theme :where(input,textarea)::placeholder){color:var(--w-muted);opacity:1}
 :global(.editor-theme :where(input,select,textarea,button,summary):focus-visible){outline:2px solid var(--w-brand);outline-offset:2px}
 :global(.editor-theme :where(input,select,textarea):disabled){color:var(--w-muted);background:var(--w-disabled);cursor:default}
 :global(.editor-theme :where(button):disabled){cursor:default;opacity:.5}
 :global(.editor-theme :where(table)){color:var(--w-text)}
 :global(.editor-theme :where(option,optgroup)){color:var(--w-text);background:var(--w-panel)}
</style>
