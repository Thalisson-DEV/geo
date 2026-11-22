import { test, expect, Page } from '@playwright/test';
import { MockApi, Perfil, loginPelaUi } from '../support/mock-api';

/**
 * Screenshots do redesign do app (não é teste de regressão): telas principais em claro e escuro,
 * no celular, no tablet em pé e no tablet deitado. Saída em docs/redesign/mobile/<etapa>/.
 *
 *   ETAPA=1-identidade npx playwright test e2e/support/redesign-shots.spec.ts --project=android
 */

const ETAPA = process.env['ETAPA'] ?? 'atual';
/** Foto 800×600 em JPEG (um poste desenhado): a tela cheia mostra a imagem com o carimbo. */
const JPEG_FOTO = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAJYAyADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwC9RRRXqHCFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFc9qv/IRl/D+QqpXNKvZtWNlSur3Osork6KX1jyH7HzOsork6KPrHkHsfM6yiuTqW0/4/IP+ui/zprEXewnR8zp6KKK6TEKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA57Vf8AkIy/h/IVUq3qv/IRl/D+QqpXnT+JnZH4UFFFFQUFFFFABUtp/wAfkH/XRf51FUtp/wAfkH/XRf5047oT2Onooor0ziCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAOe1X/kIy/h/IVUq3qv/IRl/D+QqpXnT+JnZH4UFFFFQUFFFFABUtp/x+Qf9dF/nUVS2n/H5B/10X+dOO6E9jp6KKK9M4gooooAKKKKACii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/XroqKPYw7B7SXcwbbwx9nuYpvtm7y3DY8rGcHPrW9RRVxgo7EuTluFFFFUIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAOe1X/kIy/h/IVUq3qv/ACEZfw/kKqV50/iZ2R+FBRRRUFBRRRQAVLaf8fkH/XRf51FUtp/x+Qf9dF/nTjuhPY6eiiivTOIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA57Vf+QjL+H8hVSreq/wDIRl/D+QqpXnT+JnZH4UFFFFQUFFFFABUtp/x+Qf8AXRf51FUtp/x+Qf8AXRf5047oT2Onooor0ziCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAOe1X/AJCMv4fyFVKt6r/yEZfw/kKqV50/iZ2R+FBRRRUFBRRRQAVLaf8AH5B/10X+dRVLaf8AH5B/10X+dOO6E9jp6KKK9M4gooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDntV/5CMv4fyFVKt6r/yEZfw/kKqV50/iZ2R+FBRRRUFBRRRQAVLaf8fkH/XRf51FUtp/x+Qf9dF/nTjuhPY6eiiivTOIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA57Vf+QjL+H8hVSreq/8AIRl/D+QqpXnT+JnZH4UFFFFQUFFFFABUtp/x+Qf9dF/nUVS2n/H5B/10X+dOO6E9jp6KKK9M4gooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDntV/5CMv4fyFVKt6r/AMhGX8P5CqledP4mdkfhQUUUVBQUUUUAFS2n/H5B/wBdF/nUVS2n/H5B/wBdF/nTjuhPY6eiiivTOIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA57Vf8AkIy/h/IVUq3qv/IRl/D+QqpXnT+JnZH4UFFFFQUFFFFABUtp/wAfkH/XRf51FUtp/wAfkH/XRf5047oT2Onooor0ziCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAOe1X/kIy/h/IVUq3qv/IRl/D+QqpXnT+JnZH4UFFFFQUFFFFABUtp/x+Qf9dF/nUVS2n/H5B/10X+dOO6E9jp6KKK9M4gooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDntV/5CMv4fyFVKt6r/wAhGX8P5CqledP4mdkfhQUUUVBQUUUUAFS2n/H5B/10X+dRVLaf8fkH/XRf5047oT2Onooor0ziCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAOe1X/kIy/h/IVUq3qv8AyEZfw/kKqV50/iZ2R+FBRRRUFBRRRQAVLaf8fkH/AF0X+dRVLaf8fkH/AF0X+dOO6E9jp6KKK9M4gooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDntV/wCQjL+H8hVSreq/8hGX8P5CqledP4mdkfhQUUUVBQUUUUAFS2n/AB+Qf9dF/nUVS2n/AB+Qf9dF/nTjuhPY6eiiivTOIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA57Vf+QjL+H8hVSreq/8hGX8P5CqledP4mdkfhQUUUVBQUUUUAFS2n/H5B/10X+dRVLaf8fkH/XRf5047oT2Onooor0ziCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAOe1X/kIy/h/IVUq3qv/ACEZfw/kKqV50/iZ2R+FBRRRUFBRRRQAVLaf8fkH/XRf51FUtp/x+Qf9dF/nTjuhPY6eiiivTOIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA57Vf+QjL+H8hVSreq/wDIRl/D+QqpXnT+JnZH4UFFFFQUFFFFABUtp/x+Qf8AXRf51FUtp/x+Qf8AXRf5047oT2Onooor0ziCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAOe1X/AJCMv4fyFVKt6r/yEZfw/kKqV50/iZ2R+FBRRRUFBRRRQAVLaf8AH5B/10X+dRVLaf8AH5B/10X+dOO6E9jp6KKK9M4gooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDntV/5CMv4fyFVKt6r/yEZfw/kKqV50/iZ2R+FBRRRUFBRRRQAVLaf8fkH/XRf51FUtp/x+Qf9dF/nTjuhPY6eiiivTOIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA57Vf+QjL+H8hVSreq/8AIRl/D+QqpXnT+JnZH4UFFFFQUFFFFABUtp/x+Qf9dF/nUVS2n/H5B/10X+dOO6E9jp6KKK9M4gooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDntV/5CMv4fyFVKt6r/AMhGX8P5CqledP4mdkfhQUUUVBQUUUUAFS2n/H5B/wBdF/nUVS2n/H5B/wBdF/nTjuhPY6eiiivTOIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA57Vf8AkIy/h/IVUq3qv/IRl/D+QqpXnT+JnZH4UFFFFQUFFFFABUtp/wAfkH/XRf51FUtp/wAfkH/XRf5047oT2Onooor0ziCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAOe1X/kIy/h/IVUq3qv/IRl/D+QqpXnT+JnZH4UFFFFQUFFFFABUtp/x+Qf9dF/nUVS2n/H5B/10X+dOO6E9jp6KKK9M4gooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDntV/5CMv4fyFVKt6r/wAhGX8P5CqledP4mdkfhQUUUVBQUUUUAFS2n/H5B/10X+dRVLaf8fkH/XRf5047oT2Onooor0ziCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAOe1X/kIy/h/IVUq3qv8AyEZfw/kKqV50/iZ2R+FBRRRUFBRRRQAVLaf8fkH/AF0X+dRVLaf8fkH/AF0X+dOO6E9jp6KKK9M4gooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDntV/wCQjL+H8hVSreq/8hGX8P5CqledP4mdkfhQUUUVBQUUUUAFS2n/AB+Qf9dF/nUVS2n/AB+Qf9dF/nTjuhPY6eiiivTOIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA57Vf+QjL+H8hVSreq/8hGX8P5CqledP4mdkfhQUUUVBQUUUUAFS2n/H5B/10X+dRVLaf8fkH/XRf5047oT2Onooor0ziCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAOe1X/kIy/h/IVUoorzp/Ezsj8KCiiioKCiiigAqW0/4/IP+ui/zoopx3QnsdPRRRXpnEFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH/2Q==';
const APARELHOS = {
  celular: { width: 412, height: 915 },
  'tablet-retrato': { width: 800, height: 1280 },
  'tablet-paisagem': { width: 1280, height: 800 },
} as const;

test.use({
  geolocation: { latitude: -3.7319, longitude: -38.5267, accuracy: 12 },
  permissions: ['geolocation'],
});

for (const [aparelho, viewport] of Object.entries(APARELHOS)) {
  for (const tema of ['claro', 'escuro'] as const) {
    test.describe(`${aparelho} ${tema}`, () => {
      test.use({ viewport, deviceScaleFactor: 1.5, isMobile: aparelho === 'celular', hasTouch: true });
      test.beforeEach(async ({ page }) => {
        if (tema === 'escuro') await page.addInitScript(() => localStorage.setItem('geo_tema', 'escuro'));
        await page.clock.setFixedTime(new Date('2026-10-08T10:30:00-03:00'));
      });

      async function foto(page: Page, nome: string) {
        await page.waitForTimeout(450);
        await page.screenshot({ path: `../docs/redesign/mobile/${ETAPA}/${aparelho}/${nome}-${tema}.png` });
      }

      async function entrar(page: Page, perfil: Perfil) {
        await new MockApi({ perfil, turnoAberto: true, transferencias: 12 }).install(page);
        await page.goto('/login');
        await expect(page.locator('#login')).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(300);
        if (perfil === 'CAMPO') await foto(page, '00-login');
        await loginPelaUi(page, perfil === 'CAMPO' ? 'encarregado' : 'tecnica');
      }

      test('campo', async ({ page }) => {
        test.setTimeout(120_000);
        await entrar(page, 'CAMPO');
        await foto(page, '01-hoje');
        await page.goto('/material');
        await foto(page, '04-material');
        await page.goto('/frota');
        await foto(page, '05-frota');
        await page.goto('/perfil');
        await foto(page, '06-conta');
      });

      test('catalogo', async ({ page }) => {
        test.setTimeout(90_000);
        await new MockApi({ perfil: 'CAMPO', turnoAberto: true }).install(page);
        await loginPelaUi(page);
        await page.goto('/catalogo');
        await expect(page.getByText('Catálogo de componentes')).toBeVisible();
        const main = page.locator('main');
        const altura = await main.evaluate(el => el.scrollHeight - el.clientHeight);
        const passos = altura > 0 ? 3 : 1;
        for (let i = 0; i < passos; i++) {
          await main.evaluate((el, y) => el.scrollTo(0, y), Math.round((altura * i) / Math.max(1, passos - 1)));
          await foto(page, `20-catalogo-${i + 1}`);
        }
        await page.getByRole('button', { name: 'Abrir folha' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await foto(page, '21-catalogo-folha');
      });

      test('obras', async ({ page }) => {
        test.setTimeout(150_000);
        const api = new MockApi({ perfil: 'CAMPO', turnoAberto: true, obras: true });
        api.hojeObras = new Date('2026-10-08T10:30:00-03:00');
        await api.install(page);
        await loginPelaUi(page);
        await expect(page.getByText('Pronto para trabalhar sem sinal')).toBeVisible({ timeout: 20_000 });
        await foto(page, '30-obras-hoje');
        await page.goto('/obras');
        await expect(page.getByText('Obras', { exact: true }).first()).toBeVisible();
        await foto(page, '31-obras-agenda');
        await page.goto('/obras/p-12');
        await expect(page.getByText('Rua das Flores, 100 - Vila Nova')).toBeVisible();
        await foto(page, '32-obras-ficha');
        await page.getByTestId('presenca').click();
        await page.goto('/obras/p-12/apr');
        await expect(page.getByText('APR · Equipe')).toBeVisible();
        await foto(page, '33-obras-apr-equipe');
        await page.getByTestId('apr-avancar').click();
        await foto(page, '34-obras-apr-riscos');
        await page.getByTestId('apr-avancar').click();
        await page.getByTestId('apr-avancar').click();
        await foto(page, '35-obras-apr-verificacoes');
        await page.goto('/obras/p-12/execucao');
        await expect(page.getByTestId('ponto-4')).toBeVisible();
        await page.waitForTimeout(800);
        await foto(page, '36-obras-execucao');
        await page.getByRole('button', { name: 'Abrir Ponto 4' }).click();
        await expect(page.getByTestId('detalhe-ponto')).toBeVisible();
        await foto(page, '37-obras-ponto');
        await page.goto('/obras/p-12/ocorrencia?impede=1');
        await foto(page, '38-obras-sem-condicao');
        await page.goto('/obras/relatorio');
        await foto(page, '39-obras-relatorio');
        // Projeto aproximado em tela cheia.
        await page.goto('/obras/p-12/execucao');
        await expect(page.getByTestId('ponto-4')).toBeVisible();
        if (await page.getByRole('radio', { name: 'Projeto' }).isVisible()) await page.getByRole('radio', { name: 'Projeto' }).click();
        await page.getByTestId('projeto-tela-cheia').click();
        await page.getByRole('button', { name: 'Aproximar' }).click();
        await page.waitForTimeout(900);
        await foto(page, '41-obras-projeto-cheio');
        // Execução avulsa: busca, obra encontrada, ficha.
        await page.goto('/obras/nao-programada');
        await page.getByTestId('busca-obra').fill('7000009');
        await page.getByTestId('buscar-obra').click();
        await expect(page.getByTestId('obra-avulsa')).toBeVisible();
        await page.getByRole('radio', { name: 'Emergência' }).click();
        await foto(page, '42-obras-avulsa-busca');
        await page.getByTestId('comecar-avulsa').click();
        await expect(page.getByText('Execução avulsa (fora da agenda)')).toBeVisible();
        await foto(page, '43-obras-avulsa-ficha');
      });

      test('fotos do ponto', async ({ page }) => {
        test.setTimeout(120_000);
        const api = new MockApi({ perfil: 'CAMPO', turnoAberto: true, obras: true });
        api.hojeObras = new Date('2026-10-08T10:30:00-03:00');
        api.fotoReprovada = true;
        await api.install(page);
        await loginPelaUi(page);
        await expect(page.getByTestId('foto-refazer')).toBeVisible({ timeout: 20_000 });
        await page.getByTestId('foto-refazer').scrollIntoViewIfNeeded();
        await foto(page, '50-fotos-hoje-refazer');
        await page.getByTestId('foto-refazer').click();
        const detalhe = page.getByTestId('detalhe-ponto');
        await expect(detalhe.getByTestId('proxima-foto')).toBeVisible();
        await detalhe.getByTestId('proxima-foto').scrollIntoViewIfNeeded();
        await foto(page, '51-fotos-ponto-refazer');
        // Sem sinal: a foto fica na fila (dá para apagar).
        api.offline = true;
        await page.context().setOffline(true);
        await page.evaluate(() => window.dispatchEvent(new Event('offline')));
        await detalhe.getByTestId('proxima-foto').locator('input[type=file]').setInputFiles({ name: 'poste.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(JPEG_FOTO, 'base64') });
        await expect(page.getByText(/Foto guardada/)).toBeVisible();
        await page.waitForTimeout(600);
        await foto(page, '52-fotos-ponto-tirada');
        await detalhe.getByRole('button', { name: /em tela cheia/ }).first().click();
        await foto(page, '53-fotos-tela-cheia');
      });

      test('supervisor de obras', async ({ page }) => {
        test.setTimeout(90_000);
        await new MockApi({ perfil: 'ADMINISTRATIVO', obras: true }).install(page);
        await loginPelaUi(page, 'supervisor');
        await page.goto('/supervisao');
        await expect(page.getByTestId('equipe-EQ-202')).toBeVisible();
        await foto(page, '40-supervisor-equipes');
      });

      test('administrativo', async ({ page }) => {
        test.setTimeout(90_000);
        await entrar(page, 'ADMINISTRATIVO');
        await foto(page, '10-admin-hoje');
        await page.goto('/inspecoes');
        await foto(page, '11-admin-inspecoes');
      });
    });
  }
}
