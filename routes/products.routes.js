const express = require('express');
const { authenticate, checkRole } = require('../middleware/auth.middleware');
const { validateBody } = require('../middleware/validate.middleware');
const { createProductSchema } = require('../validation/product.schemas');
const { AppError } = require('../utils/app-error');
const { serviceRoleHelpers: { getTableRow, insertIntoTable } } = require('../lib/supabase');

const router = express.Router();

async function resolveCategoryId(categoryId) {
  const normalized = String(categoryId || '').trim();
  if (!normalized) {
    return null;
  }

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  const category = await getTableRow('categories', {
    select: 'id,name,slug',
    filters: [{ column: 'slug', value: normalized }],
  });

  if (!category) {
    return null;
  }

  return category.id;
}

router.post('/produtos', authenticate, checkRole('ADMIN'), validateBody(createProductSchema), async (req, res, next) => {
  try {
    const body = req.validatedBody;
    const categoryId = await resolveCategoryId(body.categoryId);

    if (!categoryId) {
      throw new AppError('Categoria inválida.', 400);
    }

    const inserted = await insertIntoTable('products', {
      name: body.name,
      description: body.description,
      price: Number(body.price),
      image: body.image || null,
      download_url: body.downloadUrl || null,
      category_id: categoryId,
      active: body.active,
      featured: false,
      stock_quantity: 999,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return res.status(201).json({
      success: true,
      product: inserted,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
