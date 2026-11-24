"""Gera docker/pacs/raio-x.dcm (modelo de Raio-X do PACS de demonstração) a partir de uma radiografia CC0.

Fonte: "Chest Xray PA 3-8-2010.png", Wikimedia Commons, autor Stillwaterising, CC0 (domínio público)
  https://commons.wikimedia.org/wiki/File:Chest_Xray_PA_3-8-2010.png

Uso (sem instalar nada na máquina):
  curl -L -A "drtis-demo" -o /tmp/chest-pa.png \
    https://upload.wikimedia.org/wikipedia/commons/c/c8/Chest_Xray_PA_3-8-2010.png
  docker run --rm -v /tmp/chest-pa.png:/in/chest-pa.png:ro -v "$PWD/docker/pacs:/out" \
    python:3.13-slim sh -c "pip install -q pydicom==3.0.1 pillow numpy && python /out/build_raio_x_dcm.py /in/chest-pa.png /out/raio-x.dcm"

O arquivo gerado é um CR (Computed Radiography), 8 bits, MONOCHROME2, sem compressão.
Paciente, datas e UIDs são substituídos por agendamento no `pacs-seed`; aqui ficam só valores de modelo.
"""
import sys

import numpy as np
from PIL import Image
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import ComputedRadiographyImageStorage as CRImageStorage, ExplicitVRLittleEndian, PYDICOM_IMPLEMENTATION_UID, generate_uid

MAX_WIDTH = 1200  # mantém o arquivo em ~1 MB


def main(src: str, dst: str) -> None:
    img = Image.open(src).convert('L')
    if img.width > MAX_WIDTH:
        img = img.resize((MAX_WIDTH, round(img.height * MAX_WIDTH / img.width)), Image.LANCZOS)
    pixels = np.asarray(img, dtype=np.uint8)

    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = CRImageStorage
    meta.MediaStorageSOPInstanceUID = generate_uid(prefix='2.25.')
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    meta.ImplementationClassUID = PYDICOM_IMPLEMENTATION_UID

    ds = FileDataset(dst, {}, file_meta=meta, preamble=b'\0' * 128)
    ds.SpecificCharacterSet = 'ISO_IR 192'  # UTF-8: nomes com acento no pacs-seed
    ds.SOPClassUID = CRImageStorage
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID = generate_uid(prefix='2.25.')
    ds.SeriesInstanceUID = generate_uid(prefix='2.25.')

    ds.PatientName = 'MODELO^RAIO-X'
    ds.PatientID = 'MODELO'
    ds.PatientBirthDate = ''
    ds.PatientSex = 'O'

    ds.StudyDate = ds.SeriesDate = ds.ContentDate = '20260101'
    ds.StudyTime = ds.SeriesTime = ds.ContentTime = '080000'
    ds.StudyID = '1'
    ds.AccessionNumber = ''
    ds.ReferringPhysicianName = ''
    ds.StudyDescription = 'Raio-X de tórax PA'
    ds.SeriesDescription = 'Tórax PA'
    ds.Modality = 'CR'
    ds.SeriesNumber = 1
    ds.InstanceNumber = 1
    ds.BodyPartExamined = 'CHEST'
    ds.ViewPosition = 'PA'
    ds.PatientOrientation = ['L', 'F']
    ds.ImageType = ['DERIVED', 'PRIMARY']
    ds.Manufacturer = 'drtis-demo'
    ds.ImageComments = 'Imagem de demonstração. Fonte: Wikimedia Commons, Chest Xray PA 3-8-2010.png (Stillwaterising), CC0.'
    ds.BurnedInAnnotation = 'NO'

    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = 'MONOCHROME2'
    ds.Rows, ds.Columns = pixels.shape
    ds.BitsAllocated = 8
    ds.BitsStored = 8
    ds.HighBit = 7
    ds.PixelRepresentation = 0
    ds.WindowCenter = 128
    ds.WindowWidth = 256
    ds.PixelData = pixels.tobytes()

    ds.save_as(dst, enforce_file_format=True)
    print(f'{dst}: {ds.Columns}x{ds.Rows}, {len(ds.PixelData)} bytes de pixels')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
