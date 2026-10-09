/* @ds-bundle: {"format":4,"namespace":"NeonGridDesignSystem_6e94e2","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"Progress","sourcePath":"components/feedback/Progress.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"Card","sourcePath":"components/surfaces/Card.jsx"},{"name":"Dialog","sourcePath":"components/surfaces/Dialog.jsx"},{"name":"Tooltip","sourcePath":"components/surfaces/Tooltip.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"40145e569e14","components/core/Button.jsx":"4827f92e9684","components/core/Icon.jsx":"593581070790","components/core/IconButton.jsx":"1fe9ee031462","components/core/Tag.jsx":"713379b43ae7","components/feedback/Progress.jsx":"51c68f0a979b","components/feedback/Toast.jsx":"b05b8d65e1b5","components/forms/Checkbox.jsx":"b65d81eef7f7","components/forms/Input.jsx":"37dc7f22c9c1","components/forms/Radio.jsx":"3c3451b731af","components/forms/Select.jsx":"9d80e20c9eb4","components/forms/Switch.jsx":"6d4f07b9df4c","components/navigation/Tabs.jsx":"3ac4e39c6dec","components/surfaces/Card.jsx":"9c7595e2bbb0","components/surfaces/Dialog.jsx":"e05a1c21cf57","components/surfaces/Tooltip.jsx":"a5bbc52d8b5b"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.NeonGridDesignSystem_6e94e2 = window.NeonGridDesignSystem_6e94e2 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const cx = (...a) => a.filter(Boolean).join(" ");
function Badge({
  tone = "cyan",
  solid = false,
  dot = false,
  live = false,
  children,
  className,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cx("ng-badge", "ng-tone-" + tone, solid && "ng-badge--solid", live && "ng-badge--live", className)
  }, rest), dot || live ? /*#__PURE__*/React.createElement("span", {
    className: "ng-badge__dot"
  }) : null, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useEffect,
  useRef
} = React;
const pascal = s => String(s).split(/[-_ ]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("");

/** Renders a Lucide icon by kebab-case name. Requires the Lucide UMD script (window.lucide) on the page. */
function Icon({
  name,
  size = 18,
  strokeWidth = 1.75,
  className,
  style,
  ...rest
}) {
  const ref = useRef(null);
  useEffect(() => {
    const L = typeof window !== "undefined" ? window.lucide : null;
    const el = ref.current;
    if (!L || !el || !name) return;
    const node = L.icons && (L.icons[pascal(name)] || L.icons[name]);
    if (!node) return;
    const svg = L.createElement(node);
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("stroke-width", String(strokeWidth));
    el.replaceChildren(svg);
  }, [name, size, strokeWidth]);
  return /*#__PURE__*/React.createElement("span", _extends({
    ref: ref,
    "aria-hidden": "true",
    className: className ? "ng-icon " + className : "ng-icon",
    style: {
      width: size,
      height: size,
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const cx = (...a) => a.filter(Boolean).join(" ");
function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  children,
  className,
  type = "button",
  ...rest
}) {
  const is = size === "sm" ? 14 : size === "lg" ? 18 : 16;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    "data-ng-btn": variant,
    className: cx("ng-btn", "ng-btn--" + variant, "ng-btn--" + size, className)
  }, rest), icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: is
  }) : null, children, iconRight ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconRight,
    size: is
  }) : null);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const cx = (...a) => a.filter(Boolean).join(" ");
function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "md",
  className,
  type = "button",
  ...rest
}) {
  const is = size === "sm" ? 16 : size === "lg" ? 22 : 18;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    "aria-label": label,
    title: label,
    "data-ng-btn": variant,
    className: cx("ng-btn", "ng-iconbtn", "ng-btn--" + variant, "ng-btn--" + size, className)
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: is
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const cx = (...a) => a.filter(Boolean).join(" ");
function Tag({
  children,
  selected = false,
  onRemove,
  onClick,
  className,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cx("ng-tag", onClick && "ng-tag--clickable", selected && "ng-tag--selected", className),
    onClick: onClick
  }, rest), children, onRemove ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "ng-tag__x",
    "aria-label": "Remove",
    onClick: e => {
      e.stopPropagation();
      onRemove(e);
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 14
  })) : null);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Progress.jsx
try { (() => {
function Progress({
  value = 0,
  max = 100,
  label,
  showValue = true,
  segmented = false,
  className,
  style
}) {
  const pct = Math.max(0, Math.min(100, value / max * 100));
  return /*#__PURE__*/React.createElement("div", {
    className: "ng-progress" + (segmented ? " ng-progress--segmented" : "") + (className ? " " + className : ""),
    style: style,
    role: "progressbar",
    "aria-valuenow": value,
    "aria-valuemin": 0,
    "aria-valuemax": max
  }, label || showValue ? /*#__PURE__*/React.createElement("div", {
    className: "ng-progress__head"
  }, /*#__PURE__*/React.createElement("span", null, label), showValue ? /*#__PURE__*/React.createElement("span", {
    className: "ng-progress__val"
  }, Math.round(pct), "%") : null) : null, /*#__PURE__*/React.createElement("div", {
    className: "ng-progress__track"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ng-progress__fill",
    style: {
      width: pct + "%"
    }
  })));
}
Object.assign(__ds_scope, { Progress });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Progress.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const ICONS = {
  info: "info",
  success: "circle-check",
  warning: "triangle-alert",
  danger: "octagon-x"
};
const TONES = {
  info: "cyan",
  success: "success",
  warning: "warning",
  danger: "danger"
};
function Toast({
  tone = "info",
  title,
  children,
  onClose,
  className,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    className: "ng-toast ng-tone-" + TONES[tone] + (className ? " " + className : ""),
    style: style
  }, /*#__PURE__*/React.createElement("span", {
    className: "ng-toast__icon"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: ICONS[tone],
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    className: "ng-toast__main"
  }, title ? /*#__PURE__*/React.createElement("div", {
    className: "ng-toast__title"
  }, title) : null, children ? /*#__PURE__*/React.createElement("div", {
    className: "ng-toast__body"
  }, children) : null), onClose ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "ng-toast__close",
    "aria-label": "Dismiss",
    onClick: onClose
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 16
  })) : null);
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const cx = (...a) => a.filter(Boolean).join(" ");
function Checkbox({
  label,
  disabled,
  className,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: cx("ng-check", disabled && "ng-check--disabled", className),
    style: style
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "ng-check__box"
  }), label ? /*#__PURE__*/React.createElement("span", null, label) : null);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useId
} = React;
const cx = (...a) => a.filter(Boolean).join(" ");
function Input({
  label,
  hint,
  error,
  prefix,
  icon,
  id,
  disabled,
  className,
  style,
  ...rest
}) {
  const auto = useId();
  const fid = id || auto;
  return /*#__PURE__*/React.createElement("div", {
    className: cx("ng-field", className),
    style: style
  }, label ? /*#__PURE__*/React.createElement("label", {
    className: "ng-label",
    htmlFor: fid
  }, label) : null, /*#__PURE__*/React.createElement("div", {
    className: cx("ng-control", error && "ng-control--invalid", disabled && "ng-control--disabled")
  }, icon ? /*#__PURE__*/React.createElement("span", {
    className: "ng-control__adorn"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 16
  })) : prefix ? /*#__PURE__*/React.createElement("span", {
    className: "ng-control__adorn"
  }, prefix) : null, /*#__PURE__*/React.createElement("input", _extends({
    id: fid,
    className: "ng-input",
    disabled: disabled,
    "aria-invalid": !!error
  }, rest))), error ? /*#__PURE__*/React.createElement("span", {
    className: "ng-hint ng-hint--error"
  }, error) : hint ? /*#__PURE__*/React.createElement("span", {
    className: "ng-hint"
  }, hint) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const cx = (...a) => a.filter(Boolean).join(" ");
function Radio({
  label,
  disabled,
  className,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: cx("ng-check", "ng-radio", disabled && "ng-check--disabled", className),
    style: style
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "radio",
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "ng-check__box"
  }), label ? /*#__PURE__*/React.createElement("span", null, label) : null);
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useId
} = React;
const cx = (...a) => a.filter(Boolean).join(" ");
function Select({
  label,
  hint,
  error,
  options = [],
  id,
  disabled,
  className,
  style,
  ...rest
}) {
  const auto = useId();
  const fid = id || auto;
  return /*#__PURE__*/React.createElement("div", {
    className: cx("ng-field", className),
    style: style
  }, label ? /*#__PURE__*/React.createElement("label", {
    className: "ng-label",
    htmlFor: fid
  }, label) : null, /*#__PURE__*/React.createElement("div", {
    className: cx("ng-control", error && "ng-control--invalid", disabled && "ng-control--disabled")
  }, /*#__PURE__*/React.createElement("select", _extends({
    id: fid,
    className: "ng-input ng-select",
    disabled: disabled
  }, rest), options.map(o => {
    const v = typeof o === "string" ? o : o.value;
    const l = typeof o === "string" ? o : o.label;
    return /*#__PURE__*/React.createElement("option", {
      key: v,
      value: v
    }, l);
  })), /*#__PURE__*/React.createElement("span", {
    className: "ng-control__chev"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 16
  }))), error ? /*#__PURE__*/React.createElement("span", {
    className: "ng-hint ng-hint--error"
  }, error) : hint ? /*#__PURE__*/React.createElement("span", {
    className: "ng-hint"
  }, hint) : null);
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const cx = (...a) => a.filter(Boolean).join(" ");
function Switch({
  label,
  disabled,
  className,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: cx("ng-check", "ng-switch", disabled && "ng-check--disabled", className),
    style: style
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    role: "switch",
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "ng-switch__track"
  }), label ? /*#__PURE__*/React.createElement("span", null, label) : null);
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
const {
  useState
} = React;
function Tabs({
  items = [],
  value,
  defaultValue,
  onChange,
  className,
  style
}) {
  const [inner, setInner] = useState(defaultValue ?? (items[0] && items[0].id));
  const active = value ?? inner;
  return /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    className: className ? "ng-tabs " + className : "ng-tabs",
    style: style
  }, items.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    type: "button",
    role: "tab",
    "aria-selected": t.id === active,
    className: "ng-tab",
    onClick: () => {
      setInner(t.id);
      onChange && onChange(t.id);
    }
  }, t.label, t.count != null ? /*#__PURE__*/React.createElement("span", {
    className: "ng-tab__count"
  }, t.count) : null)));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const cx = (...a) => a.filter(Boolean).join(" ");
function Card({
  tone = "default",
  eyebrow,
  title,
  actions,
  interactive = false,
  children,
  className,
  ...rest
}) {
  const hasHead = eyebrow || title || actions;
  return /*#__PURE__*/React.createElement("div", _extends({
    "data-ng-card": tone,
    className: cx("ng-card", tone !== "default" && "ng-card--" + tone, interactive && "ng-card--interactive", className)
  }, rest), hasHead ? /*#__PURE__*/React.createElement("div", {
    className: "ng-card__head"
  }, /*#__PURE__*/React.createElement("div", null, eyebrow ? /*#__PURE__*/React.createElement("div", {
    className: "ng-card__eyebrow"
  }, eyebrow) : null, title ? /*#__PURE__*/React.createElement("h3", {
    className: "ng-card__title"
  }, title) : null), actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, actions) : null) : null, /*#__PURE__*/React.createElement("div", {
    className: "ng-card__body"
  }, children));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Card.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Dialog.jsx
try { (() => {
const {
  useEffect
} = React;
const cx = (...a) => a.filter(Boolean).join(" ");
function Dialog({
  open,
  onClose,
  eyebrow,
  title,
  children,
  footer,
  tone = "cyan",
  contained = false
}) {
  useEffect(() => {
    if (!open || !onClose) return;
    const k = e => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: cx("ng-overlay", contained && "ng-overlay--contained"),
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "ng-dialog",
    role: "dialog",
    "aria-modal": "true",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement(__ds_scope.Card, {
    tone: tone
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 16,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", null, eyebrow ? /*#__PURE__*/React.createElement("div", {
    className: "ng-card__eyebrow"
  }, eyebrow) : null, title ? /*#__PURE__*/React.createElement("h2", {
    className: "ng-dialog__title"
  }, title) : null), onClose ? /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "x",
    label: "Close",
    size: "sm",
    onClick: onClose
  }) : null), /*#__PURE__*/React.createElement("div", {
    className: "ng-dialog__body"
  }, children), footer ? /*#__PURE__*/React.createElement("div", {
    className: "ng-dialog__foot"
  }, footer) : null)));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Tooltip.jsx
try { (() => {
const cx = (...a) => a.filter(Boolean).join(" ");
function Tooltip({
  content,
  placement = "top",
  open = false,
  children,
  className
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: cx("ng-tip", placement === "bottom" && "ng-tip--bottom", open && "ng-tip--open", className)
  }, children, /*#__PURE__*/React.createElement("span", {
    role: "tooltip",
    className: "ng-tip__bubble"
  }, content));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Tooltip.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Progress = __ds_scope.Progress;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.Tooltip = __ds_scope.Tooltip;

})();
