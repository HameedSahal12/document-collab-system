import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle, FontSize } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Link } from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import html2pdf from 'html2pdf.js';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import axios from 'axios';
import Details, { DetailsSummary } from './extensions/Details';

const API_BASE = 'http://localhost:5050';

// Compact inline styles for the toolbar and editor shell
const styles = {
  wrapper: {
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: '#fff',
  },
  header: {
    padding: '10px 12px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: 700, margin: 0 },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    overflowX: 'auto',
    padding: '2px 0',
  },
  group: { display: 'flex', gap: 6, alignItems: 'center' },
  btn: {
    height: 28,
    padding: '0 8px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    background: '#f8fafc',
    cursor: 'pointer',
    fontSize: 12,
  },
  btnActive: { background: '#e2e8f0', borderColor: '#94a3b8' },
  btnDisabled: { opacity: 0.5, cursor: 'default' },
  sep: { width: 1, height: 20, background: '#e5e7eb', margin: '0 4px' },
  select: {
    height: 28,
    padding: '0 8px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    background: '#fff',
    fontSize: 12,
  },
  color: { width: 28, height: 28, padding: 0, border: '1px solid #e5e7eb', borderRadius: 6 },
  content: { padding: 12, minHeight: 520 },
  widthInput: { width: 60, height: 28, padding: '0 6px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 },
};

const STYLE_MAP = {
  paragraph: null,           // falls back to CSS: 14px
  title: { fontSize: '28px' },
  heading: { fontSize: '20px' },
  body: { fontSize: '16px' },
};

export default function RichEditor({ value = '', onChange, onSave, defaultStyle = 'body', title }) {
  const fileInputRef = useRef(null);
  const [sumStyle, setSumStyle] = useState('short');
  const [sumLoading, setSumLoading] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);

  const extensions = useMemo(
    () => [
      Color.configure({ types: ['textStyle'] }),
      TextStyle,
      FontSize,
      Underline,
      Link.configure({ autolink: true, openOnClick: true, linkOnPaste: true }),
      Image.configure({ inline: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      StarterKit.configure({
        heading: false, // we are styling paragraphs for Title/Heading/Body
      }),
      Details,
      DetailsSummary,
    ],
    []
  );

  const editor = useEditor({
    extensions,
    content: value || '<p></p>',
    onCreate: ({ editor }) => {
      if (defaultStyle && defaultStyle !== 'paragraph' && editor.isEmpty) {
        const st = STYLE_MAP[defaultStyle];
        if (st?.fontSize) editor.chain().focus().setFontSize(st.fontSize).run();
      }
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange && onChange(html);
    },
  });

  // Track selection to enable/disable summarize button
  useEffect(() => {
    if (!editor) return;
    const updateSel = () => {
      try {
        const sel = editor.state?.selection;
        setHasSelection(!!sel && !sel.empty);
      } catch (_) {
        setHasSelection(false);
      }
    };
    editor.on('selectionUpdate', updateSel);
    updateSel();
    return () => editor.off('selectionUpdate', updateSel);
  }, [editor]);

  // Keep editor content in sync if the prop changes from outside
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== undefined && value !== current) {
      editor.commands.setContent(value || '<p></p>', false);
    }
  }, [value, editor]);

  const applyStyle = useCallback(
    (styleKey) => {
      if (!editor) return;
      const st = STYLE_MAP[styleKey] || null;
      const { $from } = editor.state.selection;
      const depth = $from.depth;
      const from = $from.start(depth);
      const to = $from.end(depth);
      const hasRange = to > from;
      const chain = editor.chain().focus();
      if (st?.fontSize) {
        if (hasRange) chain.setTextSelection({ from, to }).setFontSize(st.fontSize).run();
        else chain.setFontSize(st.fontSize).run();
      } else {
        if (hasRange) chain.setTextSelection({ from, to }).unsetFontSize().run();
        else chain.unsetFontSize().run();
      }
    },
    [editor]
  );

  const currentStyle = useMemo(() => {
    if (!editor) return 'paragraph';
    const attrs = editor.getAttributes('textStyle') || {};
    const fs = attrs.fontSize || attrs['font-size'];
    if (fs === '28px') return 'title';
    if (fs === '20px') return 'heading';
    if (fs === '16px') return 'body';
    return 'paragraph';
  }, [editor, (editor && editor.state) || null]);

  const insertImage = useCallback((file) => {
    if (!file || !editor) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target.result;
      editor.chain().focus().setImage({ src, alt: file.name, title: file.name, width: 400 }).run();
    };
    reader.readAsDataURL(file);
  }, [editor]);

  const onPickImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const setImageWidth = useCallback((w) => {
    if (!editor) return;
    const width = Math.max(20, Math.min(2000, parseInt(w || 0, 10)));
    editor.chain().focus().updateAttributes('image', { width }).run();
  }, [editor]);

  const getSelectedText = useCallback(() => {
    if (!editor) return '';
    const { from, to } = editor.state.selection || {};
    if (typeof from !== 'number' || typeof to !== 'number') return '';
    return editor.state.doc.textBetween(from, to, "\n").trim();
  }, [editor]);

  const summarizeSelection = useCallback(async () => {
    if (!editor) return;
    const text = getSelectedText();
    if (!text) return;
    setSumLoading(true);
    try {
      // Limit extremely long selections to keep request reasonable
      const payloadText = text.length > 20000 ? text.slice(0, 20000) : text;

      const tryPost = async () => {
        const token = localStorage.getItem('token');
        return axios.post(`${API_BASE}/summarize`, { text: payloadText, style: sumStyle }, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
      };

      let res;
      try {
        res = await tryPost();
      } catch (err) {
        if (err?.response?.status === 401) {
          // Refresh token and retry once
          const rt = localStorage.getItem('refresh_token');
          if (!rt) throw err;
          try {
            const r = await axios.post(`${API_BASE}/refresh`, { refresh_token: rt });
            localStorage.setItem('token', r.data.access_token);
            res = await tryPost();
          } catch (e2) {
            throw e2;
          }
        } else {
          throw err;
        }
      }
      const summary = (res.data && res.data.summary) ? String(res.data.summary) : '';
      const toPos = editor.state.selection.to;

      const detailsNode = {
        type: 'details',
        attrs: { open: true, class: 'summary-block' },
        content: [
          { type: 'detailsSummary', content: [{ type: 'text', text: 'Summary' }] },
          ...(sumStyle === 'bullets'
            ? (() => {
                const items = summary
                  .split(/\r?\n/)
                  .map(s => s.replace(/^\-\s*/, '').trim())
                  .filter(Boolean);
                if (items.length === 0) {
                  return [{ type: 'paragraph', content: [{ type: 'text', text: summary }] }];
                }
                return [{
                  type: 'bulletList',
                  content: items.map(line => ({
                    type: 'listItem',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: line }] }],
                  })),
                }];
              })()
            : [{ type: 'paragraph', content: [{ type: 'text', text: summary }] }]
          ),
        ],
      };

      editor.chain().focus().insertContentAt(toPos, detailsNode).run();
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Unknown error';
      console.error('Summarize error:', err);
      window.alert(`Failed to summarize selection. ${msg}`);
    } finally {
      setSumLoading(false);
    }
  }, [editor, getSelectedText, sumStyle]);

  const downloadPDF = useCallback(() => {
    if (!editor) return;
    const html = editor.getHTML();
    const container = document.createElement('div');
    container.style.padding = '10mm';
    container.innerHTML = html;
    const opt = {
      margin: 10,
      filename: `${title || 'Document'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };
    html2pdf().from(container).set(opt).save();
  }, [editor, title]);

  const downloadDOCX = useCallback(async () => {
    if (!editor) return;
    const html = editor.getHTML();
    const div = document.createElement('div');
    div.innerHTML = html;
    const nodes = Array.from(div.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, div'));

    const paragraphs = nodes.map((n) => new Paragraph({
      children: [new TextRun({ text: n.textContent || '' })],
    }));

    const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${title || 'Document'}.docx`);
  }, [editor, title]);

  if (!editor) return null;

  const btn = (label, action, isActive = false, canRun = true, title) => {
    const style = { ...styles.btn, ...(isActive ? styles.btnActive : null), ...(!canRun ? styles.btnDisabled : null) };
    return (
      <button
        key={label}
        aria-label={title || label}
        disabled={!canRun}
        onMouseDown={(e) => e.preventDefault()}
        onClick={action}
        style={style}
        title={title || label}
      >
        {label}
      </button>
    );
  };

  const imgAttrs = editor.getAttributes('image') || {};

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <h3 style={styles.title}>{title || 'Document'}</h3>
        <div style={{ ...styles.toolbar, justifyContent: 'space-between', flex: 1 }}>
          <div style={styles.group}>
            <select
              value={currentStyle}
              onChange={(e) => applyStyle(e.target.value)}
              style={styles.select}
            >
              <option value="paragraph">Paragraph</option>
              <option value="title">Title</option>
              <option value="heading">Heading</option>
              <option value="body">Body</option>
            </select>

            <span style={styles.sep} />

            {btn('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'), editor.can().chain().focus().toggleBold().run(), 'Bold')}
            {btn('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'), editor.can().chain().focus().toggleItalic().run(), 'Italic')}
            {btn('U', () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'), editor.can().chain().focus().toggleUnderline().run(), 'Underline')}

            <input
              type="color"
              title="Font color"
              onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
              style={styles.color}
            />

            {btn('🔗', () => {
              const prev = editor.getAttributes('link').href || '';
              const url = window.prompt('Enter URL', prev || 'https://');
              if (url === null) return;
              if (url === '') editor.chain().focus().unsetLink().run();
              else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
            }, editor.isActive('link'), true, 'Add/Edit link')}
            {btn('⛓', () => editor.chain().focus().unsetLink().run(), false, editor.can().chain().focus().unsetLink().run(), 'Remove link')}

            <span style={styles.sep} />

            {btn('•', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'), editor.can().chain().focus().toggleBulletList().run(), 'Bullet list')}
            {btn('1.', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'), editor.can().chain().focus().toggleOrderedList().run(), 'Numbered list')}

            <span style={styles.sep} />

            {btn('L', () => editor.chain().focus().setTextAlign('left').run(), editor.isActive({ textAlign: 'left' }), true, 'Align left')}
            {btn('C', () => editor.chain().focus().setTextAlign('center').run(), editor.isActive({ textAlign: 'center' }), true, 'Align center')}
            {btn('R', () => editor.chain().focus().setTextAlign('right').run(), editor.isActive({ textAlign: 'right' }), true, 'Align right')}
            {btn('J', () => editor.chain().focus().setTextAlign('justify').run(), editor.isActive({ textAlign: 'justify' }), true, 'Justify')}

            <span style={styles.sep} />

            {btn('↶', () => editor.chain().focus().undo().run(), false, editor.can().chain().focus().undo().run(), 'Undo')}
            {btn('↷', () => editor.chain().focus().redo().run(), false, editor.can().chain().focus().redo().run(), 'Redo')}

            <span style={styles.sep} />

            {btn('Image', onPickImage, editor.isActive('image'), true, 'Insert image')}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) insertImage(f);
                e.currentTarget.value = '';
              }}
            />

            {editor.isActive('image') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#475569' }}>W:</span>
                <input
                  type="number"
                  min={20}
                  max={2000}
                  step={10}
                  value={imgAttrs.width || 400}
                  onChange={(e) => setImageWidth(e.target.value)}
                  style={styles.widthInput}
                />
                <span style={{ fontSize: 12, color: '#475569' }}>px</span>
              </div>
            )}
          </div>

          <div style={styles.group}>
            <select
              value={sumStyle}
              onChange={(e) => setSumStyle(e.target.value)}
              style={styles.select}
              title="Summary style"
            >
              <option value="short">Short (2 sentences)</option>
              <option value="medium">Medium (4 sentences)</option>
              <option value="bullets">Bullets</option>
            </select>
            {btn(sumLoading ? 'Summarizing…' : 'Summarize', summarizeSelection, false, hasSelection && !sumLoading, 'Summarize selection')}
            {btn('PDF', downloadPDF)}
            {btn('DOCX', downloadDOCX)}
          </div>
        </div>
      </div>

      <div style={styles.content}>
        <style>{`
          .ProseMirror {
            min-height: 480px;
            outline: none;
            cursor: text;
          }
          .ProseMirror p { margin: 0 0 10px; font-size: 14px; }
          .ProseMirror ul, .ProseMirror ol { padding-left: 1.25rem; margin: 0 0 10px; }
          .ProseMirror img { max-width: 100%; height: auto; }
          /* Optional block style if a custom summary container gets used later */
          .summary-block {
            margin: 8px 0;
            padding: 8px 12px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background: #fafafa;
          }
          .summary-block summary { font-weight: 600; cursor: pointer; }
        `}</style>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
