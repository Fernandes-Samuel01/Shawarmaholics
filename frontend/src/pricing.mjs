export const calculateCustomizationPrice = ({ basePrice, quantity, extras = [], sauce = {} }) => {
  const baseTotal = Number(basePrice || 0) * Number(quantity || 0);
  const extrasTotal = extras.reduce((sum, extra) => sum + Number(extra.price || 0), 0);
  const sauceTotal = Number(sauce.price || 0);
  return { baseTotal, extrasTotal, sauceTotal, finalTotal: baseTotal + extrasTotal + sauceTotal };
};
