-- R1.1 optional checkout comment.
-- Buyer content remains confined to the tenant-scoped order aggregate.

ALTER TABLE sotuvchi_orders
  ADD COLUMN buyer_comment TEXT;
