// 残量・数量の計算ヘルパー。
// JSの浮動小数点で kL を直接加減算すると境界値（残量ちょうど＝最大容量など）の比較を
// 誤る可能性があるため、1/100 kL 単位の整数（センチkL）に変換してから計算する。
// DBの精度は Decimal(10,2) なのでセンチkLと1:1で対応する。

export function toCenti(value: number | string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

export function fromCenti(centi: number): number {
  return centi / 100;
}
