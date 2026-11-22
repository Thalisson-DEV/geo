import { codigoDaFoto, coordenadas, desenharCarimbo, fusoDe, montarCarimbo } from './carimbo';
import { prepararEvidencia } from '../sst/evidencia-foto.util';

describe('carimbo das fotos de campo', () => {
  const data = new Date(2026, 9, 8, 10, 30, 15);

  it('monta título, detalhe e as linhas técnicas: data com fuso, GPS com hemisfério e precisão, autoria e código', () => {
    const c = montarCarimbo({ titulo: ' Obra 1234 · Ponto 4 ', detalhe: 'Poste instalado · Depois de pronto', data,
      latitude: -3.731901, longitude: -38.526712, precisao: 12.4, autoria: 'EQP-01 · ANA', id: '7f3a21c9-0000-4000-8000-000000000000' });
    expect(c.titulo).toBe('Obra 1234 · Ponto 4');
    expect(c.detalhe).toBe('Poste instalado · Depois de pronto');
    expect(c.dados).toEqual([
      { rotulo: 'Data', valor: `08/10/2026 10:30:15 (${fusoDe(data)})` },
      { rotulo: 'GPS', valor: '3,73190° S · 38,52671° O · ±12 m' },
      { rotulo: 'Resp.', valor: 'EQP-01 · ANA' },
      { rotulo: 'Cód.', valor: '7F3A-21C9' },
    ]);
    expect(c.id).toBe('7f3a21c9-0000-4000-8000-000000000000');
  });

  it('sem GPS diz isso; sem autoria nem id, não imprime essas linhas', () => {
    const c = montarCarimbo({ titulo: 'Ocorrência', data });
    expect(c.dados.map(d => d.rotulo)).toEqual(['Data', 'GPS']);
    expect(c.dados[1].valor).toBe('Sem localização no momento da foto');
  });

  it('coordenadas no hemisfério norte e leste, fuso e código curto', () => {
    expect(coordenadas(1.5, 20.25)).toBe('1,50000° N · 20,25000° L');
    expect(fusoDe(data)).toMatch(/^UTC[+−]\d{2}:\d{2}$/);
    expect(codigoDaFoto('ab12cd34-ffff')).toBe('AB12-CD34');
  });

  it('o quadro fica no canto inferior esquerdo e não cobre a foto inteira', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, 1600, 1200);
    desenharCarimbo(ctx, 1600, 1200, montarCarimbo({ titulo: 'Obra 1 · Ponto 1', detalhe: 'Aterramento · Durante o serviço', data, latitude: -9.4, longitude: -40.4, precisao: 8 }));
    const pixel = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)];
    // Canto superior direito intacto; canto inferior esquerdo escurecido pelo quadro.
    expect(pixel(1590, 10)).toEqual([255, 255, 255]);
    expect(pixel(1590, 1190)).toEqual([255, 255, 255]);
    expect(pixel(60, 1170)[0]).toBeLessThan(120);
  });

  it('foto carimbada é sempre regravada em JPEG, mesmo quando não fica menor, e leva o id do carimbo', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 30;
    canvas.getContext('2d')!.fillRect(0, 0, 40, 30);
    const png = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/png'));
    const arquivo = new File([png], 'pequena.png', { type: 'image/png' });

    const semCarimbo = await prepararEvidencia(arquivo);
    expect(semCarimbo.contentType).toBe('image/png');

    const carimbada = await prepararEvidencia(arquivo, { carimbo: montarCarimbo({ titulo: 'Obra 1', data, id: 'abc12345-0000' }) });
    expect(carimbada.contentType).toBe('image/jpeg');
    expect(carimbada.nomeArquivo).toBe('pequena.jpg');
    expect(carimbada.idLocal).toBe('abc12345-0000');
  });
});
