import {
  ACCOUNT_ICON_MAX_FILE_BYTES,
  validateAccountIconFile,
} from './account-icon-image'

describe('account icon image validation', () => {
  it('accepts supported image formats', () => {
    expect(() =>
      validateAccountIconFile(new File(['png'], 'logo.png', { type: 'image/png' })),
    ).not.toThrow()
    expect(() =>
      validateAccountIconFile(new File(['jpg'], 'logo.jpg', { type: 'image/jpeg' })),
    ).not.toThrow()
    expect(() =>
      validateAccountIconFile(new File(['webp'], 'logo.webp', { type: 'image/webp' })),
    ).not.toThrow()
  })

  it('rejects unsafe formats, empty files, and oversized images', () => {
    expect(() =>
      validateAccountIconFile(new File(['svg'], 'logo.svg', { type: 'image/svg+xml' })),
    ).toThrow('PNG、JPG 或 WebP')
    expect(() => validateAccountIconFile(new File([], 'empty.png', { type: 'image/png' }))).toThrow(
      '图片文件为空',
    )
    expect(() =>
      validateAccountIconFile(
        new File([new Uint8Array(ACCOUNT_ICON_MAX_FILE_BYTES + 1)], 'huge.png', {
          type: 'image/png',
        }),
      ),
    ).toThrow('5 MB')
  })
})
