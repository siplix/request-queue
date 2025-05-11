const RequestQueue = require('./request-queue');

const myQueue = new RequestQueue(mockSendRequest, 0xffff, 5000); // Таймаут 5 секунд

/** Функция-заглушка для имитации отправки запроса
 * Принимает объект запроса вида:
 *    {
 *      id: "id запроса",
 *      request: {
 *        .....
 *      }
 *    }
 *    Возвращает Promise с объектом вида:
 *    {
 *      id: "id запроса",
 *      error: "ошибка или null",
 *      response: {
 *        .....
 *      }
 *    }
 *
 * Она случайно либо успешно отвечает через некоторое время, либо вызывает ошибку, либо "теряет" ответ (таймаут)
 */
async function mockSendRequest(req) {
  const { id, request } = req;
  debug(`[=>] Отправка запроса ID: ${id}, Запрос:`, request);
  const delay = Math.random() * 6000; // Случайная задержка до 6 секунд

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const outcome = Math.random(); // Определяем исход
      if (outcome < 0.6) {
        // 60% шанс на успех
        debug(`[=>] Успешный ответ для ID: ${id}`);
        resolve({ id: id, response: { data: 'Success' } });
      } else if (outcome < 0.8) {
        // 20% шанс на ошибку
        debug(`[=>] Ошибка отправки для ID: ${id}`);
        reject(new Error(`Failed to send request ${id}`));
      } else {
        // 20% шанс на "потерю" ответа (таймаут)
        debug(`[=>] Ответ для ID: ${id} "потерян" (имитация таймаута)`);
        // Ничего не делаем, чтобы вызвать таймаут в RequestQueue
        // В реальном приложении здесь может быть сетевая ошибка без ответа
      }
    }, delay);
  });
}

myQueue.addRequest({ addr: null, cmd: '0' });

myQueue.on('success', (resp) => {
  const { id, response } = resp;
  debug('[Success] ID:', id, response);
  myQueue.addRequest({ addr: 1, cmd: '1' });
});

myQueue.on('timeout', ({ id, request, error }) => {
  debug('[Timeout] ID:', id, error.message, request);
});

myQueue.on('error', ({ id, request, error }) => {
  debug('[Error] ID:', id, error.message, request);
});

debug('Добавляем еще запросы...');

setTimeout(() => {
  debug('[setTimeout]');
  myQueue.addRequest({ addr: 2, cmd: '2' });
}, 3000);
myQueue.addRequest({ addr: 3, cmd: '3' });

debug(`[Status] Очередь: ${myQueue.getQueueSize()}, Активные: ${myQueue.getActiveCount()}`);

function debug(...args) {
  console.log(performance.now().toFixed(0), '\t\t', ...args);
}
