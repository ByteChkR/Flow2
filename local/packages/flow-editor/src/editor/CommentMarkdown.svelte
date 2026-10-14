<script>
 import {commentMarkdown,inlineMarkdown} from './comment-markdown.js';
 import CommentInline from './CommentInline.svelte';
 export let text='';
 $: blocks=commentMarkdown(text);
</script>
{#each blocks as block}
 {#if block.kind==='heading'}<svelte:element this={`h${block.level}`}><CommentInline tokens={inlineMarkdown(block.text)}/></svelte:element>
 {:else if block.kind==='code'}<pre><code>{block.text}</code></pre>
 {:else if block.kind==='list'}
  {#if block.ordered}<ol start={block.start}>{#each block.items as item}<li><CommentInline tokens={inlineMarkdown(item)}/></li>{/each}</ol>
  {:else}<ul>{#each block.items as item}<li><CommentInline tokens={inlineMarkdown(item)}/></li>{/each}</ul>{/if}
 {:else if block.kind==='quote'}<blockquote><CommentInline tokens={inlineMarkdown(block.text)}/></blockquote>
 {:else}<p><CommentInline tokens={inlineMarkdown(block.text)}/></p>{/if}
{/each}
<style>
 :global(.comment-preview) :global(h1),:global(.comment-preview) :global(h2),:global(.comment-preview) :global(h3),:global(.comment-preview) :global(h4),:global(.comment-preview) :global(h5),:global(.comment-preview) :global(h6){font-weight:700;line-height:1.25;margin:.65em 0 .35em}
 :global(.comment-preview) :global(h1){font-size:2em}:global(.comment-preview) :global(h2){font-size:1.6em}:global(.comment-preview) :global(h3){font-size:1.3em}:global(.comment-preview) :global(h4){font-size:1.15em}:global(.comment-preview) :global(h5),:global(.comment-preview) :global(h6){font-size:1em}
 p,blockquote{white-space:pre-wrap}p,pre,blockquote,ul,ol{margin:.5em 0}ul,ol{padding-left:1.6em}ul{list-style:disc}ol{list-style:decimal}pre{overflow:auto;white-space:pre;padding:6px;background:#4220060d;border-radius:3px}blockquote{border-left:3px solid #d6a642;padding-left:10px} :global(.comment-preview code){font-family:monospace;background:#4220060d;border-radius:3px;padding:0 .15em}:global(.comment-preview strong){font-weight:700}:global(.comment-preview em){font-style:italic}
</style>
