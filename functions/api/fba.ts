/**
 * POST /api/fba
 * Amazon FBA 费用计算
 *
 * Request body:
 *   {
 *     category: string,       // 商品类目
 *     price: number,          // 售价 (USD)
 *     cost: number,           // 采购成本 (USD)
 *     weight: number,         // 重量 (lb)
 *     dimensions: {           // 尺寸 (inch)
 *       length: number,
 *       width: number,
 *       height: number
 *     },
 *     isHazmat?: boolean,     // 危险品
 *     monthlyUnits?: number   // 月销量（用于估算月存储费）
 *   }
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// FBA 分类费率表（2024 美国站，USD）
// 参考：https://sellercentral.amazon.com/help/hub/reference/G201112670
const REFERRAL_FEE_RATES: Record<string, { rate: number; min: number }> = {
  electronics:       { rate: 0.08, min: 0.30 },
  clothing:          { rate: 0.17, min: 0.00 },
  shoes:             { rate: 0.15, min: 0.00 },
  beauty:            { rate: 0.08, min: 0.30 },
  toys:              { rate: 0.15, min: 0.00 },
  sports:            { rate: 0.15, min: 0.00 },
  home:              { rate: 0.15, min: 0.00 },
  kitchen:           { rate: 0.15, min: 0.00 },
  grocery:           { rate: 0.08, min: 0.30 },
  books:             { rate: 0.15, min: 0.00 },
  default:           { rate: 0.15, min: 0.00 },
};

interface Dimensions {
  length: number;
  width: number;
  height: number;
}

// 判断尺寸等级（用于 FBA 配送费）
function getSizeCategory(weight: number, dims: Dimensions): string {
  const [l, w, h] = [dims.length, dims.width, dims.height].sort((a, b) => b - a);
  const girth = 2 * (w + h);
  const lengthPlusGirth = l + girth;

  // Small standard
  if (weight <= 0.5 && l <= 15 && w <= 12 && h <= 0.75) return 'small_standard';
  // Large standard
  if (weight <= 20 && l <= 18 && w <= 14 && h <= 8) return 'large_standard';
  // Small oversize
  if (weight <= 70 && l <= 60 && w <= 30 && lengthPlusGirth <= 130) return 'small_oversize';
  // Medium oversize
  if (weight <= 150 && l <= 108 && lengthPlusGirth <= 130) return 'medium_oversize';
  // Large oversize
  if (weight <= 150 && l <= 108 && lengthPlusGirth <= 165) return 'large_oversize';
  return 'special_oversize';
}

// FBA 配送费（2024 非危险品基准，USD）
function getFulfillmentFee(sizeCategory: string, weight: number, isHazmat: boolean): number {
  const hazmatSurcharge = isHazmat ? 0.11 : 0;

  switch (sizeCategory) {
    case 'small_standard':
      return 3.22 + hazmatSurcharge;
    case 'large_standard': {
      if (weight <= 1) return 3.56 + hazmatSurcharge;
      if (weight <= 2) return 4.75 + hazmatSurcharge;
      const extra = Math.max(0, weight - 2);
      return 4.75 + extra * 0.38 + hazmatSurcharge;
    }
    case 'small_oversize': {
      const extra = Math.max(0, weight - 2);
      return 9.39 + extra * 0.39 + hazmatSurcharge;
    }
    case 'medium_oversize': {
      const extra = Math.max(0, weight - 2);
      return 14.37 + extra * 0.39 + hazmatSurcharge;
    }
    case 'large_oversize': {
      const extra = Math.max(0, weight - 90);
      return 86.62 + extra * 0.83 + hazmatSurcharge;
    }
    default:
      return 194.95 + hazmatSurcharge;
  }
}

// 月仓储费（USD/立方英尺，1-9月 vs 10-12月峰季）
function getStorageFee(dims: Dimensions, monthlyUnits: number): { offPeak: number; peak: number } {
  const cubicFeet = (dims.length * dims.width * dims.height) / 1728;
  const offPeakRate = 0.87; // Jan-Sep
  const peakRate = 2.40;    // Oct-Dec
  return {
    offPeak: +(cubicFeet * offPeakRate * monthlyUnits).toFixed(2),
    peak: +(cubicFeet * peakRate * monthlyUnits).toFixed(2),
  };
}

interface FbaRequest {
  category: string;
  price: number;
  cost: number;
  weight: number;
  dimensions: Dimensions;
  isHazmat?: boolean;
  monthlyUnits?: number;
}

export async function onRequest(context: EventContext<{}, string, {}>) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method not allowed' },
      { status: 405, headers: CORS_HEADERS }
    );
  }

  let body: FbaRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { category, price, cost, weight, dimensions, isHazmat = false, monthlyUnits = 1 } = body;

  if (!category || price == null || cost == null || weight == null || !dimensions) {
    return Response.json(
      { success: false, error: 'Missing required fields' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // 推荐费（Referral Fee）
  const feeConfig = REFERRAL_FEE_RATES[category.toLowerCase()] ?? REFERRAL_FEE_RATES.default;
  const referralFee = Math.max(price * feeConfig.rate, feeConfig.min);

  // FBA 配送费
  const sizeCategory = getSizeCategory(weight, dimensions);
  const fulfillmentFee = getFulfillmentFee(sizeCategory, weight, isHazmat);

  // 月仓储费
  const storage = getStorageFee(dimensions, monthlyUnits);

  // 合计
  const totalFees = referralFee + fulfillmentFee;
  const profit = price - cost - totalFees;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  const roi = cost > 0 ? (profit / cost) * 100 : 0;

  return Response.json(
    {
      success: true,
      data: {
        sizeCategory,
        fees: {
          referralFee: +referralFee.toFixed(2),
          fulfillmentFee: +fulfillmentFee.toFixed(2),
          totalFees: +totalFees.toFixed(2),
          storage,
        },
        profit: {
          perUnit: +profit.toFixed(2),
          margin: +margin.toFixed(1),
          roi: +roi.toFixed(1),
        },
        inputs: { category, price, cost, weight, dimensions, isHazmat, monthlyUnits },
      },
    },
    { headers: CORS_HEADERS }
  );
}
