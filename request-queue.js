const EventEmitter = require('events');

// Класс, реализующий очередь запросов с таймаутами.
class RequestQueue extends EventEmitter {
  /**
   * Очередь принимает запросы в виде объекта
   * Запросу присваивается ID и запрос отправляется в функцию sendFunction
   *
   * Пераметры:
   * sendFunction - Асинхронная функция, которая будет вызываться для отправки запроса.
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
   * maxId - Максимально возможный ID, который будет присваиваться запросам
   *
   * timeoutDuration - Длительность таймаута в миллисекундах.
   */
  constructor(sendFunction, maxId, timeoutDuration) {
    super();
    if (typeof sendFunction !== 'function') {
      throw new Error('sendFunction не функция');
    }
    this.sendFunction = sendFunction;
    this.maxId = maxId;
    this.timeoutDuration = timeoutDuration;

    this.queue = []; // Массив для хранения очереди запросов { id, request }
    this.activeRequests = new Map(); // Map для отслеживания активных запросов и их таймеров { requestId -> { timer: NodeJS.Timeout, requestData: object } }
    this.isProcessing = false; // Флаг, указывающий, обрабатывается ли сейчас запрос
    this.requestCounter = 0; // Простой счетчик для ID
  }

  // Генерирует уникальный ID для запроса.
  _generateId() {
    this.requestCounter < this.maxId ? this.requestCounter++ : (this.requestCounter = 0);
    return this.requestCounter;
  }

  // Добавляет новый запрос в очередь.
  addRequest(oRequest) {
    const requestId = this._generateId();
    const requestItem = {
      id: requestId,
      request: oRequest,
    };
    this.queue.push(requestItem);
    this._tryProcessNext(); // Пытаемся обработать следующий запрос
    return requestId;
  }

  // Пытается запустить обработку следующего запроса из очереди
  _tryProcessNext() {
    // Если уже идет обработка или очередь пуста, ничего не делаем
    if (this.isProcessing) {
      return;
    }
    if (this.queue.length === 0) {
      return;
    }

    this.isProcessing = true; // Устанавливаем флаг обработки
    const currentReq = this.queue.shift(); // Извлекаем первый запрос из очереди
    if (!currentReq) {
      this.isProcessing = false;
      return; // На всякий случай, если очередь опустела между проверками
    }

    // Устанавливаем таймаут для запроса
    const timer = setTimeout(() => {
      this._handleTimeout(currentReq.id);
    }, this.timeoutDuration);

    // Сохраняем информацию об активном запросе и его таймере
    this.activeRequests.set(currentReq.id, { timer, requestData: currentReq.request });

    // Вызываем внешнюю функцию для отправки запроса
    Promise.resolve() // Оборачиваем в Promise для единообразия
      .then(() => this.sendFunction(currentReq)) // Выполняем отправку
      .then((currentResp) => {
        // Ответ получен успешно (до таймаута)
        this._handleResponse(currentResp);
      })
      .catch((error) => {
        // Произошла ошибка при отправке или обработке
        this._handleError(currentReq.id, error);
      });
  }

  // Обрабатывает успешный ответ на запрос.
  _handleResponse(currentResp) {
    const active = this.activeRequests.get(currentResp.id);
    if (!active) {
      return;
    }
    if (
      currentResp &&
      typeof currentResp === 'object' &&
      currentResp.hasOwnProperty('id') &&
      currentResp.hasOwnProperty('response')
    ) {
      clearTimeout(active.timer); // Отменяем таймер таймаута
      this.activeRequests.delete(currentResp.id); // Удаляем из активных запросов
      try {
        this.emit('success', currentResp); // Сообщаем об успехе
      } catch (e) {
        console.log('[QUEUE]', 'emit success', e);
      }
      this.isProcessing = false; // Завершаем обработку текущего
      this._tryProcessNext(); // Пытаемся взять следующий
    } else throw new Error('The response structure is invalid');
  }

  // Обрабатывает срабатывание таймаута для запроса.
  _handleTimeout(id) {
    const active = this.activeRequests.get(id);
    if (!active) {
      return;
    }

    this.activeRequests.delete(id); // Удаляем из активных запросов

    try {
      this.emit('timeout', { id: id, request: active.requestData, error: new Error('Request timed out') }); // Сообщаем о таймауте
    } catch (e) {
      console.log('[QUEUE]', 'emit timeout', e);
    }
    // Завершаем обработку текущего и пытаемся взять следующий
    this.isProcessing = false;
    this._tryProcessNext();
  }

  // Обрабатывает ошибку при отправке или обработке запроса.
  _handleError(id, error) {
    const active = this.activeRequests.get(id);
    if (!active) {
      return;
    }

    clearTimeout(active.timer); // Отменяем таймер таймаута на всякий случай
    this.activeRequests.delete(id); // Удаляем из активных запросов

    try {
      this.emit('error', { id: id, request: active.requestData, error: error }); // Сообщаем об ошибке
    } catch (e) {
      console.log('[QUEUE]', 'emit error', e);
    }
    // Завершаем обработку текущего и пытаемся взять следующий
    this.isProcessing = false;
    this._tryProcessNext();
  }

  // Получает текущий размер очереди (запросы, ожидающие отправки).
  getQueueSize() {
    return this.queue.length;
  }

  // Получает количество активных (отправленных, но еще не получивших ответ/таймаут) запросов.
  getActiveCount() {
    return this.activeRequests.size;
  }
}

module.exports = RequestQueue;