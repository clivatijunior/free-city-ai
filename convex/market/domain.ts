import { ConvexError } from 'convex/values';
import { assertPositiveSats } from '../economy/service';
import { assertPositiveQuantity } from '../property/service';

export function calculateTotalPrice(quantity: number, unitPriceSats: number) {
  assertPositiveQuantity(quantity);
  assertPositiveSats(unitPriceSats);
  const total = quantity * unitPriceSats;
  if (!Number.isSafeInteger(total)) {
    throw new ConvexError({
      kind: 'unsafePrice',
      message: 'Total price exceeds safe integer range.',
    });
  }
  return total;
}

