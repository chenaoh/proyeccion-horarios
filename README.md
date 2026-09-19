# Proyección horarios

Producto de **Area Soft**. La app inicia vacía: cargas un Excel de proyección, defines restricciones y generas horarios.

## Abrir

Copia la carpeta `acceso-directo` (o el archivo **Proyección horarios.app** que hay dentro) a donde quieras, y dale doble clic.

También puedes:

```bash
npm install
npm run abrir
```

Eso inicia el servidor (si no está corriendo) y abre el navegador.

## Excel de entrada

El archivo no viene precargado. Debe tener hoja de asignación con:

- Celda `AREA:` y el nombre del área (aparece en el título: Proyección horarios · TIC)
- Columnas: `FICHA`, `JORNADA`, `TRIMESTRE`, `SABADO` (SI/NO), `Director`, `Ambiente`
- Una columna por instructor con horas semanales

La cantidad de fichas e instructores es la del archivo. Puede haber solo mañana, solo tarde, solo noche, o cualquier mezcla.

## Restricciones en la app

Por ficha: solo 3 h, o permitir 6 h seguidas.

Por instructor: franjas ocupadas, sin noche, sin sábado, tope de sábado 6 h o todo el sábado.

© Area Soft.
