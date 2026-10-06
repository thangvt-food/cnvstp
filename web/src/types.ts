export interface Measurement {
  id: string
  /** Giờ địa phương dạng "YYYY-MM-DDTHH:mm" (giá trị datetime-local) */
  time: string
  /** Số tế bào đếm được của 5 ô (mỗi ô 16 ô nhỏ) */
  counts: number[]
  /** Hệ số pha loãng = 10^dilutionExp (0 = không pha loãng) */
  dilutionExp: number
  total: number
  avg: number
  /** Nồng độ tế bào (tế bào/mL) */
  concentration: number
}

export interface MeasurementInput {
  time: string
  counts: number[]
  dilutionExp: number
  total: number
  avg: number
  concentration: number
}
