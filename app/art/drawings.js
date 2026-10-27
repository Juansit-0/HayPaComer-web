// Engraved drawings for empty and failed states: ink strokes with hatched shade, drawn in currentColor so they follow the theme.
const ART = {
  shelf: '<rect x="22" y="14" width="64" height="92" rx="4"/><path d="M22 44h64M22 74h64"/><path d="M86 18l18 6v76l-18 6"/><path class="hatch" d="M28 50l10-6M28 58l18-12M30 66l24-16M60 50l20-6M28 80l12-6M66 80l14-6M90 30l10-3M90 44l10-3M90 58l10-3"/><circle cx="62" cy="40" r="1.6"/>',
  bell: '<path d="M38 82V60a22 22 0 0 1 44 0v22l7 9H31z"/><path d="M52 97a8 8 0 0 0 16 0"/><path d="M60 30v-8"/><path class="hatch" d="M44 66l12-12M44 78l22-22M58 82l18-18M70 82l8-8"/><path d="M92 34h9l-9 10h9M100 20h6l-6 7h6"/>',
  plug: '<path d="M18 70h20a10 10 0 0 0 10-10V52H28v8a10 10 0 0 1-10 10z"/><path d="M33 52V40M43 52V40"/><path d="M102 70H82a10 10 0 0 1-10-10v-8h20v8a10 10 0 0 0 10 10z"/><path d="M78 56h-4M78 62h-4"/><path d="M18 70c-6 0-8 10-14 10M102 70c6 0 8 10 14 10"/><path class="hatch" d="M30 66l8-8M36 66l8-8M76 66l8-8M84 66l8-8"/><path d="M56 44l4-6M62 50l6-2M54 52l-6-2"/>',
  pot: '<path d="M26 54h68v24a18 18 0 0 1-18 18H44a18 18 0 0 1-18-18z"/><path d="M18 56h8M94 56h8"/><path d="M30 44l58-8"/><path d="M56 40l1-6h8l1 5"/><path class="hatch" d="M32 70l12-12M32 84l26-26M46 92l30-30M64 92l26-26M82 90l10-10"/><path d="M40 106h40"/>',
  plate: '<ellipse cx="60" cy="68" rx="40" ry="16"/><ellipse cx="60" cy="66" rx="26" ry="9"/><path d="M14 52v26M10 52v10c0 4 2 6 4 6s4-2 4-6V52"/><path d="M106 52c4 0 6 6 6 14h-6v12"/><path class="hatch" d="M30 74l10-6M44 80l14-8M64 80l16-9M84 76l8-5"/>',
};

export function art(kind) {
  return `<svg class="art" viewBox="0 0 120 120" aria-hidden="true">${ART[kind]}</svg>`;
}
