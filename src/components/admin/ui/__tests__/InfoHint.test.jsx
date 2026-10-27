import { fireEvent, render, screen } from '@testing-library/react';

import { InfoHint } from '../InfoHint';

// O "?" dos cards. O balão sai no <body> (portal): dentro do card, que tem
// `overflow-hidden`, ele aparecia cortado.

describe('InfoHint', () => {
  it('abre no clique, fora do card, com o texto do dicionário', () => {
    const { container } = render(
      <div className="overflow-hidden">
        <InfoHint title="Ticket médio" />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'O que é "Ticket médio"?' }));

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Valor médio de cada pedido pago');
    expect(container.contains(tooltip)).toBe(false);
    expect(document.body.contains(tooltip)).toBe(true);
  });

  it('fecha com Esc e ao rolar a página', () => {
    render(<InfoHint title="Ticket médio" />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.click(button);
    fireEvent.scroll(window);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('card sem explicação não ganha "?"', () => {
    render(<InfoHint title="Título que não existe no dicionário" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
