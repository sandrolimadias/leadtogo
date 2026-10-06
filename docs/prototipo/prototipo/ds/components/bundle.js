/* @ds-bundle: {"format":4,"namespace":"Leadtogo","components":[{"name":"Icon"},{"name":"Button"},{"name":"IconButton"},{"name":"SegmentedControl"},{"name":"TextField"},{"name":"Select"},{"name":"Checkbox"},{"name":"Switch"},{"name":"Badge"},{"name":"Tag"},{"name":"Avatar"},{"name":"StatTile"},{"name":"StatusPill"},{"name":"ActivityIcon"},{"name":"PriorityMarks"},{"name":"ActivityTimeline"},{"name":"DealCard"},{"name":"TaskCard"},{"name":"KanbanColumn"},{"name":"DataTable"},{"name":"Tabs"},{"name":"AppNav"},{"name":"TenantSwitcher"},{"name":"Menu"},{"name":"Tooltip"},{"name":"Alert"},{"name":"Toast"},{"name":"EmptyState"},{"name":"Skeleton"},{"name":"Dialog"}]} */
(function boot() {
  if (!window.React || !window.React.createElement) { setTimeout(boot, 20); return; }
  if (window.Leadtogo && window.Leadtogo.Button) return;
  var React = window.React;
  var h = React.createElement;
  var useState = React.useState;
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }
  function rest(props, omit) { var o = {}; for (var k in props) if (omit.indexOf(k) < 0) o[k] = props[k]; return o; }

  var ICONS = {"phone":"<path d=\"M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384\"/>","message-circle":"<path d=\"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719\"/>","mail":"<path d=\"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7\"/><rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\"/>","map-pin":"<path d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\"/><circle cx=\"12\" cy=\"10\" r=\"3\"/>","users":"<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><path d=\"M16 3.128a4 4 0 0 1 0 7.744\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/>","building-2":"<path d=\"M10 12h4\"/><path d=\"M10 8h4\"/><path d=\"M14 21v-3a2 2 0 0 0-4 0v3\"/><path d=\"M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2\"/><path d=\"M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16\"/>","calendar":"<path d=\"M8 2v3\"/><path d=\"M16 2v3\"/><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18\"/>","square-check":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"m16 9-5.5 5.5L8 12\"/>","square-kanban":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M8 7v7\"/><path d=\"M12 7v4\"/><path d=\"M16 7v9\"/>","layout-dashboard":"<rect width=\"7\" height=\"9\" x=\"3\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"5\" x=\"14\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"9\" x=\"14\" y=\"12\" rx=\"1\"/><rect width=\"7\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\"/>","target":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><circle cx=\"12\" cy=\"12\" r=\"6\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/>","handshake":"<path d=\"m11 17 2 2a1 1 0 1 0 3-3\"/><path d=\"m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4\"/><path d=\"m21 3 1 11h-2\"/><path d=\"M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3\"/><path d=\"M3 4h8\"/>","search":"<path d=\"m21 21-4.34-4.34\"/><circle cx=\"11\" cy=\"11\" r=\"8\"/>","plus":"<path d=\"M5 12h14\"/><path d=\"M12 5v14\"/>","funnel":"<path d=\"M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z\"/>","ellipsis":"<circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"19\" cy=\"12\" r=\"1\"/><circle cx=\"5\" cy=\"12\" r=\"1\"/>","chevron-down":"<path d=\"m6 9 6 6 6-6\"/>","chevron-right":"<path d=\"m9 18 6-6-6-6\"/>","chevron-left":"<path d=\"m15 18-6-6 6-6\"/>","x":"<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>","bell":"<path d=\"M10.268 21a2 2 0 0 0 3.464 0\"/><path d=\"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326\"/>","settings":"<path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>","star":"<path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\"/>","zap":"<path d=\"M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z\"/>","triangle-alert":"<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/>","check":"<path d=\"M20 6 9 17l-5-5\"/>","circle-check":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m16 9-5.5 5.5L8 12\"/>","circle-x":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m15 9-6 6\"/><path d=\"m9 9 6 6\"/>","circle-pause":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><line x1=\"10\" x2=\"10\" y1=\"15\" y2=\"9\"/><line x1=\"14\" x2=\"14\" y1=\"15\" y2=\"9\"/>","clock":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 6v6l4 2\"/>","route":"<circle cx=\"6\" cy=\"19\" r=\"3\"/><path d=\"M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15\"/><circle cx=\"18\" cy=\"5\" r=\"3\"/>","navigation":"<polygon points=\"3 11 22 2 13 21 11 13 3 11\"/>","repeat":"<path d=\"m17 2 4 4-4 4\"/><path d=\"M3 11v-1a4 4 0 0 1 4-4h14\"/><path d=\"m7 22-4-4 4-4\"/><path d=\"M21 13v1a4 4 0 0 1-4 4H3\"/>","paperclip":"<path d=\"m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551\"/>","user":"<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/>","log-out":"<path d=\"m16 17 5-5-5-5\"/><path d=\"M21 12H9\"/><path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"/>","sun":"<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2\"/><path d=\"M12 20v2\"/><path d=\"m4.93 4.93 1.41 1.41\"/><path d=\"m17.66 17.66 1.41 1.41\"/><path d=\"M2 12h2\"/><path d=\"M20 12h2\"/><path d=\"m6.34 17.66-1.41 1.41\"/><path d=\"m19.07 4.93-1.41 1.41\"/>","moon":"<path d=\"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401\"/>","list":"<path d=\"M3 5h.01\"/><path d=\"M3 12h.01\"/><path d=\"M3 19h.01\"/><path d=\"M8 5h13\"/><path d=\"M8 12h13\"/><path d=\"M8 19h13\"/>","layout-grid":"<rect width=\"7\" height=\"7\" x=\"3\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"7\" x=\"14\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"7\" x=\"14\" y=\"14\" rx=\"1\"/><rect width=\"7\" height=\"7\" x=\"3\" y=\"14\" rx=\"1\"/>","upload":"<path d=\"M12 3v12\"/><path d=\"m17 8-5-5-5 5\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/>","download":"<path d=\"M12 15V3\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m7 10 5 5 5-5\"/>","trash-2":"<path d=\"M10 11v6\"/><path d=\"M14 11v6\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"/><path d=\"M3 6h18\"/><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/>","pencil":"<path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/><path d=\"m15 5 4 4\"/>","globe":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\"/><path d=\"M2 12h20\"/>","briefcase":"<path d=\"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16\"/><rect width=\"20\" height=\"14\" x=\"2\" y=\"6\" rx=\"2\"/>","trending-up":"<path d=\"M16 7h6v6\"/><path d=\"m22 7-8.5 8.5-5-5L2 17\"/>","trending-down":"<path d=\"M16 17h6v-6\"/><path d=\"m22 17-8.5-8.5-5 5L2 7\"/>","info":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4\"/><path d=\"M12 8h.01\"/>","grip-vertical":"<circle cx=\"9\" cy=\"12\" r=\"1\"/><circle cx=\"9\" cy=\"5\" r=\"1\"/><circle cx=\"9\" cy=\"19\" r=\"1\"/><circle cx=\"15\" cy=\"12\" r=\"1\"/><circle cx=\"15\" cy=\"5\" r=\"1\"/><circle cx=\"15\" cy=\"19\" r=\"1\"/>","arrow-right":"<path d=\"M5 12h14\"/><path d=\"m12 5 7 7-7 7\"/>","flag":"<path d=\"M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528\"/>","circle-alert":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\"/><line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\"/>","ban":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M4.929 4.929 19.07 19.071\"/>","hourglass":"<path d=\"M5 22h14\"/><path d=\"M5 2h14\"/><path d=\"M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22\"/><path d=\"M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2\"/>"};

  /* ---------- Formatação ---------- */
  var brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  function formatBRL(v) { return typeof v === 'number' ? brl.format(v) : v; }
  function initials(name) { if (!name) return '?'; var p = String(name).trim().split(/\s+/); return ((p[0] || '')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
  var AVATAR_COLORS = ['teal', 'blue', 'indigo', 'purple', 'pink', 'orange', 'amber', 'green'];
  function colorFor(name) { var s = 0, t = String(name || ''); for (var i = 0; i < t.length; i++) s = (s * 31 + t.charCodeAt(i)) >>> 0; return AVATAR_COLORS[s % AVATAR_COLORS.length]; }

  /* ---------- Icon ---------- */
  function Icon(props) {
    var size = props.size || 16;
    var svg = ICONS[props.name] || '';
    return h('svg', {
      className: cx('lt-icon', props.className), width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: props.strokeWidth || 1.75, strokeLinecap: 'round', strokeLinejoin: 'round',
      'aria-hidden': props.label ? undefined : 'true', role: props.label ? 'img' : undefined, 'aria-label': props.label,
      dangerouslySetInnerHTML: { __html: svg }
    });
  }

  /* ---------- Button ---------- */
  function Button(props) {
    var variant = props.variant || 'secondary', size = props.size || 'md';
    var other = rest(props, ['variant', 'size', 'icon', 'iconRight', 'loading', 'block', 'className', 'children']);
    return h('button', Object.assign({ type: 'button' }, other, {
      className: cx('lt-btn', 'lt-btn--' + variant, size !== 'md' && 'lt-btn--' + size, props.block && 'lt-btn--block', props.className),
      disabled: props.disabled || props.loading, 'aria-busy': props.loading ? 'true' : undefined
    }),
      props.loading ? h('span', { className: 'lt-spinner', 'aria-hidden': 'true' }) : (props.icon ? h(Icon, { name: props.icon }) : null),
      props.children,
      props.iconRight ? h(Icon, { name: props.iconRight }) : null);
  }

  function IconButton(props) {
    var other = rest(props, ['icon', 'label', 'variant', 'size', 'className']);
    var v = props.variant || 'ghost', s = props.size || 'md';
    return h('button', Object.assign({ type: 'button' }, other, {
      className: cx('lt-iconbtn', v !== 'ghost' && 'lt-iconbtn--' + v, s !== 'md' && 'lt-iconbtn--' + s, props.className),
      'aria-label': props.label, title: props.label
    }), h(Icon, { name: props.icon, size: v === 'fab' ? 22 : (s === 'sm' ? 15 : 17) }));
  }

  function SegmentedControl(props) {
    var st = useState(props.defaultValue != null ? props.defaultValue : (props.options[0] || {}).value);
    var value = props.value != null ? props.value : st[0];
    return h('div', { className: 'lt-seg', role: 'group', 'aria-label': props.label },
      props.options.map(function (o) {
        return h('button', {
          key: o.value, type: 'button', 'aria-pressed': String(o.value === value),
          onClick: function () { st[1](o.value); if (props.onChange) props.onChange(o.value); }
        }, o.icon ? h(Icon, { name: o.icon, size: 15 }) : null, o.label);
      }));
  }

  /* ---------- Campos ---------- */
  var uid = 0; function useId(id) { var s = useState(function () { return id || 'lt-f' + (++uid); }); return s[0]; }

  function Field(p, control) {
    return h('div', { className: cx('lt-field', p.error && 'lt-field--invalid', p.className) },
      p.label ? h('label', { className: 'lt-label', htmlFor: p.id }, p.label, p.required ? h('span', { className: 'lt-req', 'aria-hidden': 'true' }, '*') : null) : null,
      control,
      p.error ? h('span', { className: 'lt-error', id: p.id + '-msg' }, h(Icon, { name: 'circle-alert', size: 14 }), p.error)
        : (p.hint ? h('span', { className: 'lt-hint', id: p.id + '-msg' }, p.hint) : null));
  }

  function TextField(props) {
    var id = useId(props.id);
    var other = rest(props, ['label', 'hint', 'error', 'icon', 'multiline', 'mono', 'suffix', 'className', 'id']);
    var common = Object.assign({}, other, {
      id: id, 'aria-invalid': props.error ? 'true' : undefined, 'aria-describedby': (props.error || props.hint) ? id + '-msg' : undefined,
      className: cx('lt-input', props.icon && 'lt-input--icon', props.mono && 'lt-input--mono', props.suffix && 'lt-input--suffix')
    });
    var input = props.multiline ? h('textarea', common) : h('input', Object.assign({ type: 'text' }, common));
    var control = props.multiline ? input : h('div', { className: 'lt-input-wrap' }, props.icon ? h(Icon, { name: props.icon }) : null, input,
      props.suffix ? h('div', { className: 'lt-input-suffix' }, props.suffix) : null);
    return Field({ id: id, label: props.label, hint: props.hint, error: props.error, required: props.required, className: props.className }, control);
  }

  function Select(props) {
    var id = useId(props.id);
    var other = rest(props, ['label', 'hint', 'error', 'options', 'placeholder', 'className', 'id']);
    var sel = h('div', { className: 'lt-select' },
      h('select', Object.assign({}, other, { id: id, 'aria-invalid': props.error ? 'true' : undefined }),
        props.placeholder ? h('option', { value: '' }, props.placeholder) : null,
        (props.options || []).map(function (o) { var v = typeof o === 'string' ? o : o.value; return h('option', { key: v, value: v }, typeof o === 'string' ? o : o.label); })),
      h(Icon, { name: 'chevron-down' }));
    return Field({ id: id, label: props.label, hint: props.hint, error: props.error, required: props.required, className: props.className }, sel);
  }

  function Checkbox(props) {
    var other = rest(props, ['label', 'description', 'className']);
    return h('label', { className: cx('lt-check', props.className) },
      h('input', Object.assign({ type: 'checkbox' }, other)),
      h('span', { className: 'lt-check-box' }, h(Icon, { name: 'check', size: 12, strokeWidth: 3 })),
      h('span', null, props.label, props.description ? h('span', { className: 'lt-check-desc' }, props.description) : null));
  }

  function Switch(props) {
    var other = rest(props, ['label', 'className']);
    return h('label', { className: cx('lt-switch', props.className) },
      h('input', Object.assign({ type: 'checkbox', role: 'switch' }, other)),
      h('span', { className: 'lt-switch-track', 'aria-hidden': 'true' }),
      props.label);
  }

  /* ---------- Exibição ---------- */
  function Badge(props) {
    return h('span', { className: cx('lt-badge', props.tone && props.tone !== 'neutral' && 'lt-badge--' + props.tone, props.className) },
      props.icon ? h(Icon, { name: props.icon, size: 13 }) : null, props.children);
  }

  function Tag(props) {
    var color = props.color || 'gray';
    return h('span', { className: cx('lt-tag', 'lt-tag--' + color, props.variant === 'outline' && 'lt-tag--outline', props.className) },
      props.dot === false ? null : h('span', { className: 'lt-tag-dot', 'aria-hidden': 'true' }),
      props.children,
      props.onRemove ? h('button', { type: 'button', className: 'lt-tag-remove', onClick: props.onRemove, 'aria-label': 'Remover ' + props.children }, h(Icon, { name: 'x', size: 12, strokeWidth: 2.5 })) : null);
  }

  function Avatar(props) {
    var size = props.size || 'md';
    var color = props.color || colorFor(props.name);
    return h('span', { className: cx('lt-avatar', size !== 'md' && 'lt-avatar--' + size, !props.src && 'lt-tag--' + color, props.className), title: props.name, 'aria-label': props.name, role: 'img' },
      props.src ? h('img', { src: props.src, alt: '' }) : initials(props.name));
  }

  function Sparkline(p) {
    var d = p.data, w = 120, hgt = 28, max = Math.max.apply(null, d), min = Math.min.apply(null, d), span = (max - min) || 1;
    var pts = d.map(function (v, i) { return [i * (w / (d.length - 1)), hgt - 3 - ((v - min) / span) * (hgt - 6)]; });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var last = pts[pts.length - 1];
    return h('svg', { className: 'lt-stat-spark', viewBox: '0 0 ' + w + ' ' + hgt, preserveAspectRatio: 'none', width: '100%', height: hgt, 'aria-hidden': 'true' },
      h('path', { className: 'area', d: line + ' L' + w + ' ' + hgt + ' L0 ' + hgt + ' Z' }),
      h('path', { className: 'line', d: line, vectorEffect: 'non-scaling-stroke' }),
      h('circle', { cx: last[0], cy: last[1], r: 2.5 }));
  }

  function StatTile(props) {
    var dir = props.delta == null ? null : (props.deltaDirection || (String(props.delta).trim()[0] === '-' ? 'down' : 'up'));
    return h('div', { className: cx('lt-stat', props.className) },
      h('span', { className: 'lt-stat-label' }, props.label),
      h('span', { className: 'lt-stat-value' }, typeof props.value === 'number' && props.currency !== false ? formatBRL(props.value) : props.value),
      (props.delta != null || props.hint) ? h('span', { className: 'lt-stat-foot' },
        dir ? h('span', { className: 'lt-delta lt-delta--' + (props.deltaTone || dir) }, h(Icon, { name: dir === 'down' ? 'trending-down' : 'trending-up', size: 14 }), props.delta) : null,
        props.hint ? h('span', null, props.hint) : null) : null,
      props.spark ? h(Sparkline, { data: props.spark }) : null);
  }

  var STATUS = {
    ativo: ['Ativo', 'circle-pause'], conquistado: ['Conquistado', 'circle-check'], perdido: ['Perdido', 'circle-x'],
    cancelado: ['Cancelado', 'ban'], suspenso: ['Suspenso', 'clock']
  };
  STATUS.ativo[1] = 'target';
  function StatusPill(props) {
    var s = STATUS[props.status] || STATUS.ativo;
    return h('span', { className: cx('lt-status', 'lt-status--' + (props.status || 'ativo'), props.className) }, h(Icon, { name: s[1], size: 13, strokeWidth: 2 }), s[0]);
  }

  var ACT = {
    ligacao: ['Ligação', 'phone'], whatsapp: ['WhatsApp', 'message-circle'], email: ['E-mail', 'mail'],
    visita: ['Visita', 'map-pin'], reuniao: ['Reunião', 'users'], tarefa: ['Tarefa', 'square-check']
  };
  function ActivityIcon(props) {
    var a = ACT[props.type] || ACT.tarefa;
    return h('span', { className: cx('lt-acticon', 'lt-acticon--' + (props.type || 'tarefa'), props.size === 'sm' && 'lt-acticon--sm'), title: a[0] },
      h(Icon, { name: a[1], size: props.size === 'sm' ? 12 : 14, label: a[0] }));
  }

  function PriorityMarks(props) {
    if (!props.importante && !props.urgente) return null;
    return h('span', { className: 'lt-prio' },
      props.importante ? h('span', { className: 'lt-prio-mark lt-prio-mark--importante', title: 'Importante' }, h(Icon, { name: 'star', size: 11, strokeWidth: 2.5 }), 'Importante') : null,
      props.urgente ? h('span', { className: 'lt-prio-mark lt-prio-mark--urgente', title: 'Urgente' }, h(Icon, { name: 'zap', size: 11, strokeWidth: 2.5 }), 'Urgente') : null);
  }

  var SIT = { pendente: [null, 'Pendente'], em_execucao: ['info', 'Em execução'], realizada: ['success', 'Realizada'], cancelada: [null, 'Cancelada'], atrasada: ['danger', 'Atrasada'] };
  function ActivityTimeline(props) {
    return h('ol', { className: cx('lt-timeline', props.className) }, (props.items || []).map(function (it, i) {
      var s = SIT[it.status] || SIT.pendente;
      return h('li', { key: it.id || i, className: cx('lt-tl-item', it.status === 'realizada' && 'lt-tl-item--done', it.status === 'cancelada' && 'lt-tl-item--canceled') },
        h(ActivityIcon, { type: it.type }),
        h('div', { className: 'lt-tl-body' },
          h('div', { className: 'lt-tl-head' }, h('span', { className: 'lt-tl-title' }, it.title),
            h(Badge, { tone: s[0] || 'neutral' }, s[1]), h(PriorityMarks, { importante: it.importante, urgente: it.urgente })),
          h('div', { className: 'lt-tl-meta' },
            it.when ? h('span', { className: 'lt-num' }, it.when) : null,
            it.contact ? h('span', { className: 'lt-sep' }) : null, it.contact ? h('span', null, it.contact) : null,
            it.owner ? h('span', { className: 'lt-sep' }) : null, it.owner ? h('span', null, it.owner) : null,
            it.repeat ? h('span', { className: 'lt-sep' }) : null, it.repeat ? h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 } }, h(Icon, { name: 'repeat', size: 13 }), it.repeat) : null),
          it.note ? h('div', { className: 'lt-tl-note' }, it.note) : null));
    }));
  }

  function Due(p) {
    if (!p.due) return null;
    return h('span', { className: cx('lt-due', p.state === 'late' && 'lt-due--late', p.state === 'today' && 'lt-due--today') },
      h(Icon, { name: p.state === 'late' ? 'triangle-alert' : 'calendar', size: 13 }), p.due);
  }

  function DealCard(props) {
    return h('article', { className: cx('lt-deal', props.stale && 'lt-deal--stale', props.dragging && 'lt-deal--dragging', props.className), tabIndex: 0, 'aria-label': props.title + ', ' + props.company },
      h('div', { className: 'lt-card-top' }, h('span', { className: 'lt-card-title' }, props.title),
        props.owner ? h(Avatar, { name: props.owner, size: 'sm' }) : null),
      h('div', { className: 'lt-card-sub' }, h(Icon, { name: 'building-2', size: 13 }), h('span', null, props.company)),
      (props.value != null) ? h('div', { className: 'lt-card-values' },
        h('span', { className: 'lt-card-value' }, formatBRL(props.value)),
        props.mrr ? h('span', { className: 'lt-card-mrr' }, formatBRL(props.mrr) + '/mês') : null) : null,
      props.tags && props.tags.length ? h('div', { className: 'lt-row' }, props.tags.map(function (t) { return h(Tag, { key: t.label, color: t.color }, t.label); })) : null,
      props.stale ? h('span', { className: 'lt-stale-note' }, h(Icon, { name: 'hourglass', size: 13 }), props.stale) : null,
      h('div', { className: 'lt-card-foot' },
        props.next ? h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } }, h(ActivityIcon, { type: props.next.type, size: 'sm' }), props.next.label)
          : (props.next === false ? h('span', { className: 'lt-stale-note' }, h(Icon, { name: 'calendar', size: 13 }), 'Sem próxima atividade') : null),
        h('span', { className: 'lt-push' }, h(Due, { due: props.due, state: props.dueState }))));
  }
  ICONS.hourglass = ICONS.hourglass || ICONS.clock;

  function TaskCard(props) {
    var cl = props.checklist;
    return h('article', { className: cx('lt-task', props.dragging && 'lt-task--dragging', props.className), tabIndex: 0, 'aria-label': props.title },
      h('div', { className: 'lt-card-top' }, h(ActivityIcon, { type: props.type || 'tarefa', size: 'sm' }), h('span', { className: 'lt-card-title' }, props.title),
        props.owner ? h(Avatar, { name: props.owner, size: 'sm' }) : null),
      props.company ? h('div', { className: 'lt-card-sub' }, h(Icon, { name: 'building-2', size: 13 }), h('span', null, props.company)) : null,
      (props.importante || props.urgente || (props.labels && props.labels.length)) ? h('div', { className: 'lt-row' },
        h(PriorityMarks, { importante: props.importante, urgente: props.urgente }),
        (props.labels || []).map(function (t) { return h(Tag, { key: t.label, color: t.color, dot: false }, t.label); })) : null,
      cl ? h('div', { className: 'lt-progress-row' }, h(Icon, { name: 'square-check', size: 13 }),
        h('span', { className: 'lt-progress', role: 'progressbar', 'aria-valuenow': cl.done, 'aria-valuemax': cl.total, 'aria-label': 'Checklist' }, h('span', { style: { width: (100 * cl.done / cl.total) + '%' } })),
        cl.done + '/' + cl.total) : null,
      (props.due || props.repeat) ? h('div', { className: 'lt-card-foot' },
        h(Due, { due: props.due, state: props.dueState }),
        props.repeat ? h('span', { className: 'lt-push', style: { display: 'inline-flex', alignItems: 'center', gap: 4 } }, h(Icon, { name: 'repeat', size: 13 }), props.repeat) : null) : null);
  }

  function KanbanColumn(props) {
    var over = props.limit != null && props.count > props.limit;
    return h('section', { className: cx('lt-col', props.className), 'aria-label': props.title },
      h('header', { className: 'lt-col-head' },
        h('span', { className: 'lt-col-dot', style: { background: 'var(--tag-' + (props.color || 'gray') + '-fg)' } }),
        h('span', { className: 'lt-col-title' }, props.title),
        props.count != null ? h('span', { className: cx('lt-col-count', over && 'lt-col-limit') }, props.limit != null ? props.count + '/' + props.limit : props.count) : null,
        props.total != null ? h('span', { className: 'lt-col-total' }, formatBRL(props.total)) : null),
      h('div', { className: 'lt-col-body' }, props.children,
        props.onAdd !== false ? h('button', { type: 'button', className: 'lt-col-add', onClick: props.onAdd }, h(Icon, { name: 'plus', size: 15 }), props.addLabel || 'Adicionar') : null));
  }

  function DataTable(props) {
    var cols = props.columns || [], rows = props.rows || [];
    var sel = useState(props.defaultSelected || []);
    function toggle(id) { var s = sel[0].slice(), i = s.indexOf(id); if (i < 0) s.push(id); else s.splice(i, 1); sel[1](s); }
    return h('div', { className: 'lt-table-wrap' },
      h('table', { className: cx('lt-table', props.density === 'compact' && 'lt-table--compact') },
        props.caption ? h('caption', { className: 'lt-visually-hidden' }, props.caption) : null,
        h('thead', null, h('tr', null,
          props.selectable ? h('th', { className: 'lt-sel' }, h('span', { className: 'lt-visually-hidden' }, 'Selecionar')) : null,
          cols.map(function (c) {
            return h('th', { key: c.key, className: c.align === 'right' ? 'lt-right' : undefined, style: c.width ? { width: c.width } : undefined, 'aria-sort': c.sorted ? (c.sorted === 'desc' ? 'descending' : 'ascending') : undefined },
              c.sorted ? h('span', { className: 'lt-sort' }, c.label, h(Icon, { name: 'chevron-down', size: 13 })) : c.label);
          }))),
        h('tbody', null, rows.map(function (r, i) {
          var id = r.id != null ? r.id : i, on = sel[0].indexOf(id) >= 0;
          return h('tr', { key: id, 'aria-selected': props.selectable ? String(on) : undefined },
            props.selectable ? h('td', { className: 'lt-sel' }, h(Checkbox, { checked: on, onChange: function () { toggle(id); }, 'aria-label': 'Selecionar linha' })) : null,
            cols.map(function (c) { return h('td', { key: c.key, className: c.align === 'right' ? 'lt-right' : undefined }, c.render ? c.render(r) : r[c.key]); }));
        }))));
  }

  function Tabs(props) {
    var st = useState(props.defaultValue != null ? props.defaultValue : (props.items[0] || {}).value);
    var value = props.value != null ? props.value : st[0];
    return h('div', { className: 'lt-tabs', role: 'tablist', 'aria-label': props.label },
      props.items.map(function (t) {
        return h('button', { key: t.value, type: 'button', role: 'tab', 'aria-selected': String(t.value === value), onClick: function () { st[1](t.value); if (props.onChange) props.onChange(t.value); } },
          t.icon ? h(Icon, { name: t.icon, size: 15 }) : null, t.label, t.count != null ? h('span', { className: 'lt-tab-count' }, t.count) : null);
      }));
  }

  /* ---------- Navegação ---------- */
  function TenantSwitcher(props) {
    var t = props.current || {};
    return h('button', { type: 'button', className: 'lt-tenant', 'aria-haspopup': 'menu', onClick: props.onClick },
      h('span', { className: cx('lt-tenant-logo', 'lt-tag--' + (t.color || 'teal')) }, initials(t.name)),
      h('span', { className: 'lt-tenant-text' }, h('b', null, t.name), h('span', null, t.role)),
      h(Icon, { name: 'chevron-down', size: 15 }));
  }

  function AppNav(props) {
    return h('nav', { className: cx('lt-nav', props.className), 'aria-label': 'Principal' },
      h('div', { className: 'lt-nav-brand' }, h('span', { className: 'lt-nav-mark' }, h(Icon, { name: 'arrow-right', size: 15, strokeWidth: 2.5 })), props.productName || 'Leadtogo'),
      props.tenant ? h(TenantSwitcher, { current: props.tenant }) : null,
      (props.groups || []).map(function (g, gi) {
        return h('div', { key: gi, className: 'lt-nav-group' },
          g.label ? h('span', { className: 'lt-nav-group-label' }, g.label) : null,
          g.items.map(function (it) {
            return h('a', { key: it.label, href: it.href || '#', className: 'lt-nav-item', 'aria-current': it.active ? 'page' : undefined, onClick: function (e) { if (!it.href) e.preventDefault(); } },
              h(Icon, { name: it.icon, size: 17 }), it.label, it.count != null ? h('span', { className: 'lt-nav-count' }, it.count) : null);
          }));
      }),
      props.user ? h('div', { className: 'lt-nav-foot' }, h(Avatar, { name: props.user.name }),
        h('span', { className: 'lt-nav-user' }, h('b', null, props.user.name), h('span', null, props.user.role)),
        h(IconButton, { icon: 'settings', label: 'Configurações', size: 'sm' })) : null);
  }

  function Menu(props) {
    return h('div', { className: cx('lt-menu', props.className), role: 'menu', 'aria-label': props.label },
      (props.items || []).map(function (it, i) {
        if (it.separator) return h('div', { key: 's' + i, className: 'lt-menu-sep', role: 'separator' });
        if (it.heading) return h('div', { key: 'h' + i, className: 'lt-menu-label' }, it.heading);
        return h('button', { key: i, type: 'button', role: it.checked != null ? 'menuitemradio' : 'menuitem', 'aria-checked': it.checked != null ? String(!!it.checked) : undefined, className: cx('lt-menu-item', it.danger && 'lt-menu-item--danger'), onClick: it.onSelect },
          it.icon ? h(Icon, { name: it.icon }) : null, h('span', null, it.label),
          it.shortcut ? h('span', { className: 'lt-menu-shortcut' }, it.shortcut) : null,
          it.checked ? h(Icon, { name: 'check' }) : null);
      }));
  }

  function Tooltip(props) {
    return h('span', { className: cx('lt-tip', props.open && 'lt-tip--open') }, props.children, h('span', { className: 'lt-tip-bubble', role: 'tooltip' }, props.label));
  }

  /* ---------- Feedback ---------- */
  var TONE_ICON = { info: 'info', success: 'circle-check', warning: 'triangle-alert', danger: 'circle-alert' };
  function Alert(props) {
    var tone = props.tone || 'info';
    return h('div', { className: 'lt-alert lt-alert--' + tone, role: tone === 'danger' ? 'alert' : 'status' },
      h(Icon, { name: TONE_ICON[tone], size: 18 }),
      props.title ? h('span', { className: 'lt-alert-title' }, props.title) : null,
      props.children ? h('span', { className: 'lt-alert-text', style: props.title ? { gridColumn: 2 } : undefined }, props.children) : null,
      props.actions ? h('div', { className: 'lt-alert-actions' }, props.actions) : null);
  }

  function Toast(props) {
    var tone = props.tone || 'success';
    return h('div', { className: 'lt-toast lt-toast--' + tone, role: 'status' },
      h(Icon, { name: TONE_ICON[tone], size: 18 }),
      h('span', { className: 'lt-toast-title' }, props.title),
      h(IconButton, { icon: 'x', label: 'Fechar', size: 'sm', onClick: props.onClose }),
      props.description ? h('span', { className: 'lt-toast-text', style: { gridColumn: 2 } }, props.description) : null,
      props.action ? h('div', { className: 'lt-toast-actions' }, props.action) : null);
  }

  function EmptyState(props) {
    return h('div', { className: 'lt-empty' },
      h('span', { className: 'lt-empty-icon' }, h(Icon, { name: props.icon || 'search', size: 22 })),
      h('span', { className: 'lt-empty-title' }, props.title),
      props.description ? h('span', { className: 'lt-empty-text' }, props.description) : null,
      props.actions ? h('div', { className: 'lt-empty-actions' }, props.actions) : null);
  }

  function Skeleton(props) {
    if (props.lines) {
      var out = []; for (var i = 0; i < props.lines; i++) out.push(h('span', { key: i, className: 'lt-skel', style: { height: 12, width: i === props.lines - 1 ? '60%' : '100%' } }));
      return h('span', { style: { display: 'flex', flexDirection: 'column', gap: 8 }, 'aria-hidden': 'true' }, out);
    }
    return h('span', { className: 'lt-skel', 'aria-hidden': 'true', style: { width: props.width || '100%', height: props.height || 12, borderRadius: props.circle ? 9999 : undefined } });
  }

  function Dialog(props) {
    if (props.open === false) return null;
    var panel = h('div', { className: 'lt-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lt-dlg-title' },
      h('div', { className: 'lt-dialog-head' },
        h('div', { style: { flex: 1 } }, h('h2', { className: 'lt-dialog-title', id: 'lt-dlg-title' }, props.title),
          props.description ? h('p', { className: 'lt-dialog-desc' }, props.description) : null),
        h(IconButton, { icon: 'x', label: 'Fechar', onClick: props.onClose })),
      props.children ? h('div', { className: 'lt-dialog-body' }, props.children) : null,
      props.footer ? h('div', { className: 'lt-dialog-foot' }, props.footer) : null);
    return props.inline ? h('div', { className: 'lt-dialog-scrim' }, panel) : panel;
  }

  var api = {
    Icon: Icon, Button: Button, IconButton: IconButton, SegmentedControl: SegmentedControl, TextField: TextField, Select: Select,
    Checkbox: Checkbox, Switch: Switch, Badge: Badge, Tag: Tag, Avatar: Avatar, StatTile: StatTile, StatusPill: StatusPill,
    ActivityIcon: ActivityIcon, PriorityMarks: PriorityMarks, ActivityTimeline: ActivityTimeline, DealCard: DealCard, TaskCard: TaskCard,
    KanbanColumn: KanbanColumn, DataTable: DataTable, Tabs: Tabs, AppNav: AppNav, TenantSwitcher: TenantSwitcher, Menu: Menu,
    Tooltip: Tooltip, Alert: Alert, Toast: Toast, EmptyState: EmptyState, Skeleton: Skeleton, Dialog: Dialog,
    formatBRL: formatBRL, iconNames: Object.keys(ICONS)
  };
  window.Leadtogo = Object.assign(window.Leadtogo || {}, api);
})();
