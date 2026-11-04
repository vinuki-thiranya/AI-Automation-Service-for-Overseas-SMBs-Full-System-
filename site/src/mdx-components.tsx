import type { MDXComponents } from "mdx/types";

// Posts are styled by the .prose-post wrapper in globals.css, so no component overrides are needed.
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return components;
}
