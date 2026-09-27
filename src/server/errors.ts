/** خطأ موجّه للمستخدم (رسالته بالعربي وتتعرض كما هي) */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}
