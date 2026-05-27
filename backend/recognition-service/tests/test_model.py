import torch

from model import DentalNet, DentalNetConfig


def test_dentalnet_forward_output_shape():
    model = DentalNet(
        DentalNetConfig(filters=[8, 16], fc_units=16, use_attention=False, dropout=0.0)
    )
    model.eval()
    batch = torch.randn(2, 3, 64, 64)

    with torch.no_grad():
        logits = model(batch)

    assert logits.shape == (2, 1)
