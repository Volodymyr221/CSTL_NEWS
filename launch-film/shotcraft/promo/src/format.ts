import React from 'react';

// Формат кадру: вертикальний 1080×1920 (Reels/Stories) або квадрат 1080×1080 (допис).
// Сцени питають useSq() і беруть свої розміри/позиції під формат.
export const Fmt = React.createContext({ sq: false });
export const useSq = () => React.useContext(Fmt).sq;
/** У квадраті карта стискається (×0.72) і підіймається: центр 980 → 620. */
export const mapT = (sq: boolean): React.CSSProperties =>
  sq ? { position: 'absolute', inset: 0, transform: 'translate(0px, -360px) scale(0.72)', transformOrigin: '540px 980px' } : { position: 'absolute', inset: 0 };
/** точка екрана → координати карти (для цілі польоту в телефон) */
export const toMap = (sq: boolean, x: number, y: number) => (sq ? { x: 540 + (x - 540) / 0.72, y: 980 + (y - 620) / 0.72 } : { x, y });
