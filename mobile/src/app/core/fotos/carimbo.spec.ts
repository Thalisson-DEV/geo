import { linhasDoCarimbo } from './carimbo';
import { prepararEvidencia } from '../sst/evidencia-foto.util';

describe('carimbo das fotos de campo', () => {
  const data = new Date(2026, 9, 8, 10, 30);

  it('monta contexto, data e posição com a precisão', () => {
    expect(linhasDoCarimbo({ contexto: ['Obra 1234 · Ponto 4', 'Depois'], data, latitude: -3.731901, longitude: -38.526712, precisao: 12.4 }))
      .toEqual(['Obra 1234 · Ponto 4', 'Depois', '08/10/2026 10:30', '-3.73190, -38.52671 · ±12 m']);
  });

  it('sem GPS diz que não há localização e ignora contexto vazio', () => {
    expect(linhasDoCarimbo({ contexto: ['  ', 'Antes'], data })).toEqual(['Antes', '08/10/2026 10:30', 'Sem localização']);
  });

  it('foto carimbada é sempre regravada em JPEG, mesmo quando não fica menor', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 30;
    canvas.getContext('2d')!.fillRect(0, 0, 40, 30);
    const png = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/png'));
    const arquivo = new File([png], 'pequena.png', { type: 'image/png' });

    const semCarimbo = await prepararEvidencia(arquivo);
    expect(semCarimbo.contentType).toBe('image/png');

    const carimbada = await prepararEvidencia(arquivo, { carimbo: ['Obra 1', '08/10/2026 10:30'] });
    expect(carimbada.contentType).toBe('image/jpeg');
    expect(carimbada.nomeArquivo).toBe('pequena.jpg');
  });
});
