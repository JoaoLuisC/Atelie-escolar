import { describe, expect, it } from 'vitest';
import { parseStorageRef } from '../storage-signed-url.js';

describe('parseStorageRef', () => {
  it.each([
    [
      'public URL com bucket+path',
      'https://abc.supabase.co/storage/v1/object/public/product_files/kits/festa.pdf',
      { bucket: 'product_files', path: 'kits/festa.pdf' },
    ],
    [
      'signed URL existente',
      'https://abc.supabase.co/storage/v1/object/sign/product_files/file.pdf?token=eyJ...',
      { bucket: 'product_files', path: 'file.pdf' },
    ],
    [
      'authenticated URL',
      'https://abc.supabase.co/storage/v1/object/authenticated/product_files/sub/file.pdf',
      { bucket: 'product_files', path: 'sub/file.pdf' },
    ],
    [
      'path encoded',
      'https://abc.supabase.co/storage/v1/object/public/product_files/festa%20junina.pdf',
      { bucket: 'product_files', path: 'festa junina.pdf' },
    ],
    [
      'path simples sem protocolo',
      'product_files/material/aulas.pdf',
      { bucket: 'product_files', path: 'material/aulas.pdf' },
    ],
  ])('extrai bucket+path: %s', (_label, input, expected) => {
    expect(parseStorageRef(input)).toEqual(expected);
  });

  it.each([
    ['Google Drive', 'https://drive.google.com/file/d/abc/view'],
    ['link arbitrário', 'https://example.com/files/x.pdf'],
    ['string vazia', ''],
    ['null', null],
    ['undefined', undefined],
    ['número', 42],
    ['path inválido sem barra', 'arquivo-sem-bucket.pdf'],
  ])('retorna null para URL externa/inválida: %s', (_label, input) => {
    expect(parseStorageRef(input)).toBeNull();
  });
});
