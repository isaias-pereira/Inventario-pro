import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Calendar } from '../components/ui/calendar';

/**
 * O calendário usa o react-day-picker v9 (a v8 exigia `date-fns` v2/v3 como
 * peer e quebrava o install quando o Dependabot atualizava o `date-fns`).
 */
describe('Calendário (react-day-picker v9)', () => {
  it('renderiza o mês e os dias do mês atual', () => {
    render(<Calendar mode="single" selected={new Date(2026, 10, 17)} />);

    // O mês de novembro de 2026 começa em domingo (1) e tem 30 dias.
    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(25);
    expect(screen.getByText('17')).toBeInTheDocument();
  });

  it('escolhe um dia e devolve a data selecionada', async () => {
    const user = userEvent.setup();
    let escolhida: Date | undefined;

    render(
      <Calendar
        mode="single"
        selected={new Date(2026, 10, 17)}
        onSelect={(date) => { escolhida = date; }}
      />,
    );

    await user.click(screen.getByText('20'));

    expect(escolhida).toBeInstanceOf(Date);
    expect(escolhida?.getDate()).toBe(20);
    expect(escolhida?.getMonth()).toBe(10);
    expect(escolhida?.getFullYear()).toBe(2026);
  });

  it('navega entre os meses', async () => {
    const user = userEvent.setup();
    render(<Calendar mode="single" selected={new Date(2026, 10, 17)} />);

    const proximo = screen.getByRole('button', { name: /next/i });
    await user.click(proximo);

    // A legenda do mês passa de novembro para dezembro de 2026.
    expect(screen.getAllByText(/december/i).length).toBeGreaterThan(0);
  });
});
