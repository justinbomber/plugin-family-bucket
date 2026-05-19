/**
 * 對應 background/storage.js 之 defaults（含 compilers），供 Plugin Family Bucket 種子／正規化用。
 */

const MATCH =
  '\\.(?:markdown|mdown|mkdn|md|mkd|mdwn|mdtxt|mdtext|text)(?:#.*|\\?.*)?$';

export function getMarkdownViewerDefaultSettings() {
  return {
    theme: 'github',
    compiler: 'markdown-it',
    raw: false,
    match: MATCH,
    themes: {
      width: 'auto',
    },
    content: {
      autoreload: false,
      emoji: false,
      mathjax: false,
      mermaid: false,
      syntax: true,
      toc: false,
    },
    origins: {
      'file://': {
        header: true,
        path: true,
        match: MATCH,
      },
    },
    settings: {
      icon: 'default',
      theme: 'light',
    },
    custom: {
      theme: '',
      color: 'auto',
    },
    'markdown-it': {
      breaks: false,
      html: true,
      linkify: true,
      typographer: false,
      xhtmlOut: false,
      langPrefix: 'language-',
      quotes: '\u201c\u201d\u2018\u2019',
      abbr: false,
      attrs: false,
      cjk: false,
      deflist: false,
      footnote: false,
      ins: false,
      mark: false,
      sub: false,
      sup: false,
      tasklists: false,
    },
    marked: {
      breaks: false,
      gfm: true,
      pedantic: false,
      linkify: true,
      smartypants: false,
    },
    remark: {
      breaks: false,
      gfm: true,
      sanitize: false,
    },
  };
}
