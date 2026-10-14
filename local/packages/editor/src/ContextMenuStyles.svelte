<!-- Shared by workspace-tree, tab and both canvas context menus. -->
<style>
 :global(.flow2-context-menu[popover]){position:fixed;inset:auto;margin:0;box-sizing:border-box;min-width:200px;max-width:calc(100vw - 16px);max-height:min(680px,calc(100vh - 16px - var(--menu-top,0px)));overflow:auto;padding:4px;border:1px solid var(--w-border,var(--f-border,#d1d5db));border-radius:6px;background:var(--w-panel,var(--f-panel,#fff));color:var(--w-text,var(--f-text,#1f2937));box-shadow:0 6px 20px #0003;font:inherit;font-size:13px;line-height:1.4}
 :global(.flow2-context-menu[popover]:popover-open){display:flex;flex-direction:column;gap:2px}
 :global(.flow2-context-menu[popover] button),:global(.flow2-context-menu[popover] summary){box-sizing:border-box;display:block;width:100%;min-height:30px;margin:0;padding:6px 10px;border:0;border-radius:3px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
 :global(.flow2-context-menu[popover] button:not(:disabled):hover),:global(.flow2-context-menu[popover] summary:hover){background:var(--w-bg,var(--f-bg,#f3f4f6))}
 :global(.flow2-context-menu[popover] button:focus-visible),:global(.flow2-context-menu[popover] summary:focus-visible){outline:2px solid var(--w-brand,var(--f-brand,#2563eb));outline-offset:-2px}
 :global(.flow2-context-menu[popover] button:disabled){opacity:.45;cursor:default}
 :global(.flow2-context-menu[popover]>strong){padding:5px 10px;font-weight:600;font-size:12px;overflow-wrap:anywhere}
 :global(.flow2-context-menu[popover] details){margin-top:2px;padding-top:2px;border-top:1px solid var(--w-border,var(--f-border,#d1d5db))}
 :global(.flow2-context-menu[popover] details>summary){display:list-item;list-style-position:inside}
 :global(.flow2-context-menu[popover] details>label),:global(.flow2-context-menu[popover] details>p),:global(.flow2-context-menu[popover] details>small){display:block;margin:6px 10px}
 :global(.flow2-context-menu[popover] details>label){display:flex;flex-direction:column;gap:4px}
 :global(.flow2-context-menu[popover] .graph-actions){display:grid;gap:2px}
</style>
