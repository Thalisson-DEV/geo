BEGIN;
INSERT INTO veiculos (id, placa, modelo, fabricante, id_base_operacional, ativo, data_criacao, versao, usuario_criacao)
SELECT gen_random_uuid(), v.placa, v.modelo, v.fab, b.id, true, now() - (random()*150||' days')::interval, 0, 'USRADMIN'
FROM (VALUES ('RPA4C21','Hilux CD 2.8 4x4','Toyota','JUAZEIRO'),('SJK2D45','S10 LS 2.8 4x4','Chevrolet','JUAZEIRO'),
 ('QTB7F12','Strada Endurance 1.3','Fiat','REMANSO'),('RPC9H33','Ranger XL 2.2','Ford','REMANSO'),
 ('SKA1J08','Delivery 11.180 Munck','Volkswagen','JACOBINA'),('QTN3B77','Saveiro Robust 1.6','Volkswagen','JACOBINA'),
 ('RPE5K90','Accelo 1016 Cesto Aéreo','Mercedes-Benz','BONFIM'),('SJN8L64','L200 Triton GL','Mitsubishi','BONFIM'),
 ('QTE2M19','Hilux CD 2.8 4x4','Toyota','BONFIM'),('RPH6N52','Montana 1.2 Turbo','Chevrolet','JUAZEIRO')) v(placa,modelo,fab,base)
JOIN bases_operacionais b ON b.nome=v.base
WHERE NOT EXISTS (SELECT 1 FROM veiculos x WHERE x.placa=v.placa);
COMMIT;
