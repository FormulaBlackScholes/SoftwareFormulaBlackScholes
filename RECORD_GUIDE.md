# 🎬 Playwright Record - Calculator Flow Guide

## Problema
Il playwright record non funziona bene per il login su Windows, ma puoi usarlo per registrare la navigazione della calcolatrice.

## Soluzione
Usa lo script di bootstrap + playwright inspector per registrare manualmente.

## Opzione 1: Usa Playwright Inspector (Consigliato)

```powershell
# 1. Apri il playwright inspector
npx playwright codegen https://avaoptions.avatrade.com

# 2. Nel browser che si apre:
#    - Effettua login manuale (l'inspector non registra il login)
#    - Naviga al trading
#    - Clicca sulla calcolatrice
#    - Interagisci con i controlli
#    - Chiudi la calcolatrice

# 3. Copia il codice generato dall'inspector nel tuo test
```

## Opzione 2: Record Script Automatico

```powershell
# 1. Esegui lo script di record
node record-calculator.js

# 2. Nel browser:
#    - Login manuale
#    - Naviga al trading
#    - Clicca sulla calcolatrice
#    - Interagisci

# 3. Premi Ctrl+C per fermare e salvare
```

## Opzione 3: Estrai i Selettori Manualmente (Veloce)

Se conosci già i selettori (come quelli trovati su Linux), puoi direttamente:

1. **Apri DevTools** (F12) su Windows in AvaTrade
2. **Trova l'elemento Quantità** e ispezionalo
3. **Copia il selector** dalle opzioni:
   ```javascript
   // Option A: Form with text
   await page.locator('form').filter({ hasText: 'Quantità' }).getByRole('img').click();
   
   // Option B: Text selector
   await page.getByText('Quantità').click();
   
   // Option C: Div with nth
   await page.locator('div').filter({ hasText: 'Quantità' }).nth(5).click();
   ```

## Selettori Trovati su Linux (Copia da Qui)

### Aprire Calcolatrice
```javascript
// Method 1: Form with image role
await page.locator('form').filter({ hasText: 'Quantità' }).getByRole('img').click();

// Method 2: Text selector
await page.getByText('Quantità').click();

// Method 3: Div with filter and nth
await page.locator('div').filter({ hasText: 'Quantità' }).nth(5).click();
```

### Chiudere Calcolatrice
```javascript
// Method 1: Apply button
await page.getByText('Applica', { exact: true }).click();

// Method 2: Close class
await page.locator('.tradeCalculator__close').click();

// Method 3: Outside click
await page.click('body');
```

### Slider nel Calculator
```javascript
// Read current value
const value = await slider.evaluate((el) => parseInt(el.getAttribute('value')));

// Set value via keyboard
await slider.click();
await page.keyboard.press('ArrowUp');  // Increment
await page.keyboard.press('ArrowDown'); // Decrement
```

## Workflow Completo per Windows

1. **Apri Inspector**:
   ```powershell
   npx playwright codegen https://avaoptions.avatrade.com --headed
   ```

2. **Nel browser**:
   - Accedi al tuo account DEMO
   - Vai al trading
   - Clicca su "Quantità" (non registrato)
   - L'inspector mostrerà il selector usato
   - Copia il comando dal pannello inspector

3. **Nel codice** (trade.spec.js):
   - Incolla il comando registrato
   - Aggiungi i comandi per il slider (keyboard)
   - Testa

## Esempio di Output Inspector

Inspector mostra:
```
await page.locator('form').filter({ hasText: 'Quantità' }).getByRole('img').click();
// o
await page.getByText('Quantità').click();
```

Usa uno di questi nel tuo test!

## Windows vs Linux - Differenze

| Platform | Selector | Note |
|----------|----------|------|
| Windows | Varia (DevTools per verificare) | Usa inspector per record |
| Linux | `form` + `Quantità` + `img` | Già testato ✓ |

Entrambi i selettori dovrebbero funzionare su Windows se il DOM è uguale.

## Troubleshooting

### "Inspector non si apre"
```bash
# Prova con opzioni esplicite
PWDEBUG=1 npx playwright test record-calculator.js --headed
```

### "Selector non funziona su Windows"
1. Apri DevTools (F12)
2. Seleziona l'elemento
3. Copia il selector suggerito
4. Prova nel test

### "Login non viene registrato"
Normale - il login è complesso. Usa il selettore pre-autenticato per il rest.

## Codice Pronto da Copiare

Questi selettori sono già nel codice (trade.spec.js):
```javascript
// Aprire
await page.locator('form').filter({ hasText: 'Quantità' }).getByRole('img').last().click();
await page.locator('div').filter({ hasText: 'Quantità' }).nth(5).click();
await page.getByText('Quantità').click();

// Chiudere
await page.locator('.tradeCalculator__close').click();
await page.getByText('Applica', { exact: true }).click();
```

## Prossimi Passi

1. ✅ Selettori per aprire = FATTO (6 strategie nel codice)
2. ✅ Selettori per chiudere = FATTO (3 strategie nel codice)
3. ✅ Slider keyboard = FATTO (ArrowUp/ArrowDown)
4. Test su Windows con uno di questi selettori

## Comandi Veloci

```powershell
# Record mode
npx playwright codegen https://avaoptions.avatrade.com

# Run test
npm test -- tests/trade.spec.js

# Run con browser visibile
npm test -- tests/trade.spec.js --headed

# Debug mode
PWDEBUG=1 npm test -- tests/trade.spec.js
```

---

**Tip**: Se preferisci non usare il record, i selettori trovati su Linux dovrebbero funzionare anche su Windows perché usano API standard di Playwright (`getByRole()`, `getByText()`, ecc).
