export class BuyerQueryValidationError extends Error {
  constructor() {
    super('buyer query validation failed');
    this.name = 'BuyerQueryValidationError';
  }
}

export class BuyerIntentUnknownError extends Error {
  constructor() {
    super('buyer intent is unknown');
    this.name = 'BuyerIntentUnknownError';
  }
}

export class BuyerProductNotFoundError extends Error {
  constructor() {
    super('buyer product not found');
    this.name = 'BuyerProductNotFoundError';
  }
}

export class BuyerGroundingError extends Error {
  constructor() {
    super('buyer response grounding failed');
    this.name = 'BuyerGroundingError';
  }
}

export class BuyerSessionError extends Error {
  constructor() {
    super('buyer storefront session unavailable');
    this.name = 'BuyerSessionError';
  }
}
