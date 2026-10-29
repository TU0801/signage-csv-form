import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// jsdom には canvas の描画が無いので、pdfjs は差し替える（8ページの PDF）
vi.mock('../lib/pdfPages', () => ({
  openPdfPages: vi.fn(async () => ({
    pageCount: 8,
    render: vi.fn(async () => {}),
    pageTexts: vi.fn(async () => []),
    destroy: vi.fn(),
  })),
}));

import { FilePreview } from '../components/FilePreview';

describe('FilePreview', () => {
  it('PDF は先頭の5ページを出し、ボタンで6ページ目以降も出す（修正依頼1027(5)）', async () => {
    render(<FilePreview file={new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' })} />);
    expect(await screen.findByLabelText('5ページ目')).toBeInTheDocument();
    expect(screen.queryByLabelText('6ページ目')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '残り 3 ページを表示' }));
    expect(screen.getByLabelText('8ページ目')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /残り/ })).not.toBeInTheDocument();
  });

  it('動画（MP4・MOV）は再生できる形で出す（修正依頼1029 決定③）', async () => {
    const create = vi.fn(() => 'blob:video');
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const { container } = render(<FilePreview file={new File(['x'], 'IMG_0001.MOV')} />);
    await vi.waitFor(() => expect(container.querySelector('video')).not.toBeNull());
    const video = container.querySelector('video')!;
    expect(video).toHaveAttribute('src', 'blob:video');
    expect(video).toHaveAttribute('controls');
  });
});
