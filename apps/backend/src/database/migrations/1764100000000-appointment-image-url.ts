import type { MigrationInterface, QueryRunner } from 'typeorm';

/** PACS de demonstração: URL do Stone Web Viewer do estudo gerado para o agendamento (preenchida pelo pacs-seed). */
export class AppointmentImageUrl1764100000000 implements MigrationInterface {
  name = 'AppointmentImageUrl1764100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
ALTER TABLE appointment ADD COLUMN image_viewer_url text NULL
  CONSTRAINT appointment_image_viewer_url_http CHECK (image_viewer_url ~ '^https?://');
COMMENT ON COLUMN appointment.image_viewer_url IS 'URL do Stone Web Viewer (PACS de demonstração); NULL = sem imagem';`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE appointment DROP COLUMN IF EXISTS image_viewer_url;`);
  }
}
